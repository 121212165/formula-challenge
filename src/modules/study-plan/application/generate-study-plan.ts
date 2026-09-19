/**
 * GenerateStudyPlan Use Case —— 计划生成不是 AI 决定（架构文档 §24 / Phase 9 完整计划器）。
 *
 * 三路候选（Scheduler 产出，PlanGenerator 排序）：
 *   1) due     —— dueAt <= now 的 LearningState（type="review"）。
 *   2) weakness—— 复用 get-user-progress 的薄弱判定（again 次数 / lapseCount>0 / stability<1天），
 *                 但只取【尚未到期】（dueAt > now）的薄弱项：已到期的卡片已由 due 通道排入，
 *                 不重复占位（type="weakness"，reason 带触发原因）。
 *   3) new     —— 用户 enabled 科目下 published 且用户尚无 LearningState 的 KnowledgePoint
 *                 （自发现，不再依赖调用方必传 newKnowledgePointIds；该参数保留为可选注入/追加）。
 *
 * 优先级（§25）：due review > 薄弱项（stability 低 / lapseCount 高 / again 多者先）> 新知识。
 * 重要度 weight：new 段按 weight 降序；review/weakness 的重要度目前为软信号占位（未跨表补权重，
 * 策略可配置化），故主排序仍由 FSRS 调度信号决定。
 *
 * 日预算：注入 profileReader 时按 UserLearningProfile.dailyItemTarget（条目数上限）做全局裁剪，
 * 高优先级保留；未注入时退化为旧行为（maxReview / maxNew 分通道上限，不做全局裁剪）。
 * dailyMinutes 仅作记录字段，当前不参与条目裁剪。
 *
 * BR-063：本 use case 是计划条目的唯一写入口（source 写死 "scheduler"）。
 * 路由/其他层没有 planRepo.saveItem 的公开调用入口；AI 只能建议，不能直接落计划。
 */

import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { InvalidStateTransitionError } from "@/shared/errors";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { StudyPlan, StudyPlanItem, StudyPlanItemType } from "../domain/study-plan";
import { canTransitionPlan } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

/** 薄弱项 stability 阈值（天），与 get-user-progress 保持一致 */
const WEAK_STABILITY_THRESHOLD_DAYS = 1;
/** 分通道默认上限（未注入 profileReader 时沿用旧行为） */
const DEFAULT_MAX_REVIEW = 10;
const DEFAULT_MAX_NEW = 5;
/** UserLearningProfile.dailyItemTarget 数据库默认值（未注入 profileReader 时的兜底） */
const DEFAULT_DAILY_ITEM_TARGET = 10;

/** 用户每日条目预算读取（HTTP 组合根由 identity profiles 适配实现，避免 study-plan 直依赖 identity） */
export interface StudyPlanProfileReader {
  getDailyItemTarget(userId: string): Promise<number>;
}

/** 用户启用科目读取（可选；HTTP 组合根由 identity subjectPrefs 适配） */
export interface StudyPlanSubjectReader {
  listEnabledSubjectIds(userId: string): Promise<string[]>;
}

export interface GenerateStudyPlanDeps {
  planRepo: StudyPlanRepository;
  learningRepos: LearningRepositories;
  uow: UnitOfWork;
  /** 新知识自发现：已发布知识点读取（可选；缺省时退化为仅用 newKnowledgePointIds 注入） */
  knowledgePoints?: KnowledgePointRepository;
  /** 每日条目预算读取（可选；缺省时不做全局 dailyItemTarget 裁剪，沿用 maxReview/maxNew） */
  profileReader?: StudyPlanProfileReader;
  /** 启用科目读取（可选；与 cmd.subjectIds 二选一） */
  enabledSubjectsReader?: StudyPlanSubjectReader;
  idGen?: () => string;
  now?: () => Date;
}

export interface GenerateStudyPlanCommand {
  userId: string;
  localDate: string;
  /** 新知识点候选（未学过的 published 知识点，由上层注入/覆盖；自发现启用后作为追加） */
  newKnowledgePointIds?: string[];
  /** 显式指定启用科目（自发现 new 候选的范围）；缺省走 enabledSubjectsReader */
  subjectIds?: string[];
  /** 最大复习条目数（默认 10） */
  maxReview?: number;
  /** 最大新学条目数（默认 5） */
  maxNew?: number;
}

export interface GenerateStudyPlanResult {
  plan: StudyPlan;
  items: StudyPlanItem[];
}

/** 内部候选：携带排序信号，统一排序后再落 position */
interface Candidate {
  knowledgePointId: string;
  type: StudyPlanItemType;
  reason: string;
  /** 通道优先级：review=0 < weakness=1 < new=2 */
  tier: 0 | 1 | 2;
  stability: number;
  lapseCount: number;
  againCount: number;
  dueAt: Date | null;
  weight: number;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class GenerateStudyPlan {
  constructor(private readonly deps: GenerateStudyPlanDeps) {}

  async execute(cmd: GenerateStudyPlanCommand): Promise<GenerateStudyPlanResult> {
    const { planRepo, learningRepos, uow, knowledgePoints, profileReader, enabledSubjectsReader } =
      this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());
    const nowDate = now();
    const maxReview = cmd.maxReview ?? DEFAULT_MAX_REVIEW;
    const maxNew = cmd.maxNew ?? DEFAULT_MAX_NEW;

    return uow.transaction(async () => {
      // 已有当日计划：不重复生成（BR-060：UNIQUE(userId, localDate)）
      const existing = await planRepo.findByLocalDate(cmd.userId, cmd.localDate);
      if (existing) {
        return { plan: existing, items: await planRepo.findItemsByPlan(existing.id) };
      }

      // ── 候选通道 1：due 到期复习（按 dueAt 升序，带分通道上限）──
      const dueStates = await learningRepos.learningStates.findDue(cmd.userId, nowDate, maxReview);
      const selected = new Set<string>();
      const candidates: Candidate[] = [];
      for (const s of dueStates) {
        selected.add(s.knowledgePointId);
        candidates.push({
          knowledgePointId: s.knowledgePointId,
          type: "review",
          reason: `到期复习（dueAt ${s.dueAt.toISOString()}）`,
          tier: 0,
          stability: s.stability,
          lapseCount: s.lapseCount,
          againCount: 0,
          dueAt: s.dueAt,
          // 重要度软信号占位：review 通道未跨表补 weight（策略可配置化）
          weight: 1,
        });
      }

      // ── 候选通道 2：weakness 非到期薄弱项（复用 get-user-progress 判定）──
      const [allStates, reviewEventsForUser] = await Promise.all([
        learningRepos.learningStates.findAllByUser(cmd.userId),
        learningRepos.reviewEvents.findAllByUser(cmd.userId),
      ]);
      const againCountByKp = new Map<string, number>();
      for (const ev of reviewEventsForUser) {
        if (ev.rating === "again") {
          againCountByKp.set(
            ev.knowledgePointId,
            (againCountByKp.get(ev.knowledgePointId) ?? 0) + 1
          );
        }
      }
      for (const s of allStates) {
        // 已被 due 通道排入的不重复；尚未到期（dueAt > now）才走 weakness 通道
        if (selected.has(s.knowledgePointId)) continue;
        if (s.dueAt.getTime() <= nowDate.getTime()) continue;
        const againCount = againCountByKp.get(s.knowledgePointId) ?? 0;
        const parts: string[] = [];
        if (againCount > 0) parts.push(`连续答错×${againCount}`);
        if (s.lapseCount > 0) parts.push(`曾遗忘×${s.lapseCount}`);
        if (s.stability < WEAK_STABILITY_THRESHOLD_DAYS) {
          parts.push(`稳定性过低(${s.stability}天)`);
        }
        if (parts.length === 0) continue;
        candidates.push({
          knowledgePointId: s.knowledgePointId,
          type: "weakness",
          reason: `薄弱项：${parts.join("；")}`,
          tier: 1,
          stability: s.stability,
          lapseCount: s.lapseCount,
          againCount,
          dueAt: s.dueAt,
          weight: 1,
        });
      }

      // ── 候选通道 3：new 未学过的 published 新知识（自发现 + 注入）──
      const learnedSet = new Set(allStates.map((s) => s.knowledgePointId));
      const newCandidates: Array<{ knowledgePointId: string; weight: number }> = [];
      const addedNew = new Set<string>();
      const pushNew = (kpId: string, weight: number) => {
        if (selected.has(kpId)) return;
        if (learnedSet.has(kpId)) return;
        if (addedNew.has(kpId)) return;
        addedNew.add(kpId);
        newCandidates.push({ knowledgePointId: kpId, weight });
      };

      // 3a. 自发现：启用科目下 published 且未学
      if (knowledgePoints) {
        const subjectIds =
          cmd.subjectIds ??
          (enabledSubjectsReader
            ? await enabledSubjectsReader.listEnabledSubjectIds(cmd.userId)
            : undefined);
        if (subjectIds && subjectIds.length > 0) {
          for (const subjectId of subjectIds) {
            const published = await knowledgePoints.listPublishedBySubject(subjectId);
            for (const kp of published) {
              pushNew(kp.id, kp.weight);
            }
          }
        }
      }
      // 3b. 上层注入的 newKnowledgePointIds 作为追加（权重软信号占位 1）
      for (const kpId of cmd.newKnowledgePointIds ?? []) {
        pushNew(kpId, 1);
      }
      // new 段预算 + 排序：weight 降序（listPublishedBySubject 已排序，注入项权重占位）
      newCandidates.sort((a, b) => b.weight - a.weight);
      for (const c of newCandidates.slice(0, maxNew)) {
        candidates.push({
          knowledgePointId: c.knowledgePointId,
          type: "new",
          reason: "新知识",
          tier: 2,
          stability: Number.POSITIVE_INFINITY,
          lapseCount: 0,
          againCount: 0,
          dueAt: null,
          weight: c.weight,
        });
      }

      // ── 统一优先级排序（tier 升序；各 tier 内按调度信号；weight 作跨段兜底）──
      candidates.sort(compareCandidates);

      // ── 日预算裁剪：注入 profileReader 时按 dailyItemTarget 全局裁剪（高优先级保留）──
      let finalCandidates = candidates;
      if (profileReader) {
        const dailyTarget = await profileReader.getDailyItemTarget(cmd.userId);
        const budget = Number.isFinite(dailyTarget) && dailyTarget > 0 ? dailyTarget : DEFAULT_DAILY_ITEM_TARGET;
        finalCandidates = candidates.slice(0, budget);
      }

      // 先生成 draft 计划，再显式激活到 active（§24：禁止生成即 active）
      const plan: StudyPlan = {
        id: idGen(),
        userId: cmd.userId,
        localDate: cmd.localDate,
        source: "scheduler",
        status: "draft",
      };
      const items: StudyPlanItem[] = finalCandidates.map((c, index) => ({
        id: idGen(),
        planId: plan.id,
        knowledgePointId: c.knowledgePointId,
        type: c.type,
        reason: c.reason,
        position: index,
        status: "pending",
      }));

      await planRepo.savePlan(plan);
      for (const item of items) {
        await planRepo.saveItem(item);
      }

      // 草稿落库后，显式激活 draft → active（守卫校验）
      if (!canTransitionPlan(plan.status, "active")) {
        throw new InvalidStateTransitionError(
          `StudyPlan 非法迁移：${plan.status} → active`
        );
      }
      const activePlan: StudyPlan = { ...plan, status: "active" };
      await planRepo.savePlan(activePlan);

      return { plan: activePlan, items };
    });
  }
}

/**
 * 全局优先级比较器（小者在前）：
 *   tier：review(0) < weakness(1) < new(2)
 *   review 段：dueAt 升序（最久该复习的先）
 *   weakness 段：stability 升序 → lapseCount 降序 → againCount 降序（越危险越先）
 *   weight：跨段兜底降序（重要度软信号）
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 0) {
    // review：dueAt 升序
    return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
  }
  if (a.tier === 1) {
    // weakness：stability 低 → lapseCount 高 → againCount 多
    if (a.stability !== b.stability) return a.stability - b.stability;
    if (a.lapseCount !== b.lapseCount) return b.lapseCount - a.lapseCount;
    return b.againCount - a.againCount;
  }
  // new：weight 降序（listPublishedBySubject 已含 sortOrder 次序，稳定排序保持）
  return b.weight - a.weight;
}
