/**
 * GenerateStudyPlan Use Case —— 计划生成不是 AI 决定（架构文档 §24）。
 * 第一层 Scheduler 产生候选（到期复习）；PlanGenerator 排序；AI 只能建议。
 *
 * 优先级（§25）：到期复习 > 高遗忘风险（retrievability 低者先）> 高重要度 > 新知识。
 * 首期实现：due review 按 dueAt 升序 → 新知识补齐。
 */

import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";
import type { StudyPlan, StudyPlanItem } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

export interface GenerateStudyPlanDeps {
  planRepo: StudyPlanRepository;
  learningRepos: LearningRepositories;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface GenerateStudyPlanCommand {
  userId: string;
  localDate: string;
  /** 新知识点候选（未学过的 published 知识点，由上层提供） */
  newKnowledgePointIds?: string[];
  /** 最大复习条目数（默认 10） */
  maxReview?: number;
  /** 最大新学条目数（默认 5） */
  maxNew?: number;
}

export interface GenerateStudyPlanResult {
  plan: StudyPlan;
  items: StudyPlanItem[];
}

function randomId(): string {
  return crypto.randomUUID();
}

export class GenerateStudyPlan {
  constructor(private readonly deps: GenerateStudyPlanDeps) {}

  async execute(cmd: GenerateStudyPlanCommand): Promise<GenerateStudyPlanResult> {
    const { planRepo, learningRepos, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());
    const maxReview = cmd.maxReview ?? 10;
    const maxNew = cmd.maxNew ?? 5;

    return uow.transaction(async () => {
      // 已有当日计划：不重复生成（BR-060：UNIQUE(userId, localDate)）
      const existing = await planRepo.findByLocalDate(cmd.userId, cmd.localDate);
      if (existing) {
        return { plan: existing, items: await planRepo.findItemsByPlan(existing.id) };
      }

      // 第一层：Scheduler 候选 —— 到期复习，按到期时间升序
      const dueStates = await learningRepos.learningStates.findDue(
        cmd.userId,
        now(),
        maxReview
      );
      const reviewCandidates = dueStates.map((s) => ({
        knowledgePointId: s.knowledgePointId,
        type: "review" as const,
        reason: `到期复习（dueAt ${s.dueAt.toISOString()}）`,
      }));

      // 新知识补齐
      const newCandidates = (cmd.newKnowledgePointIds ?? [])
        .slice(0, maxNew)
        .map((kpId) => ({
          knowledgePointId: kpId,
          type: "new" as const,
          reason: "新知识",
        }));

      const all = [...reviewCandidates, ...newCandidates];
      const plan: StudyPlan = {
        id: idGen(),
        userId: cmd.userId,
        localDate: cmd.localDate,
        source: "scheduler",
        status: "active",
      };
      const items: StudyPlanItem[] = all.map((c, index) => ({
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

      return { plan, items };
    });
  }
}
