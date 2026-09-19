/**
 * GetUserProgress Use Case —— 基础进度读模型（Phase 7 验收 5）。
 *
 * 只读查询，不需要 UnitOfWork（与 GetTodayPlan 一致）。聚合多个仓储读取：
 *   - coverage：所选科目下"已发布知识点总数 vs 已学（有 LearningState）数"分字段给出，
 *     不折叠成单一 mastery 百分比（learning-model 要求）。
 *   - reviewedCount：累计复习次数（= 该用户 ReviewEvent 总数，一次 FinalizeReview 一条）。
 *   - dueList：当前到期需复习的 LearningState（dueAt <= now），FSRS 复习队列天然跨科目。
 *   - weakList：薄弱知识点（任务 C，最小可行判定集，见下文）。
 *   - stabilityDistribution：按稳定性区间计数（单位：天，FSRS stability）。
 */

import type { LearningStateRepository, ReviewEventRepository } from "../domain/repositories";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";

/** 复习队列单次返回上限（防止脏数据把 dueList 撑爆） */
const DUE_LIST_LIMIT = 200;
/** 薄弱项 stability 阈值（单位：天）：低于此值视为"低稳定性" */
const WEAK_STABILITY_THRESHOLD_DAYS = 1;

export interface GetUserProgressDeps {
  learningStates: LearningStateRepository;
  reviewEvents: ReviewEventRepository;
  knowledgePoints: KnowledgePointRepository;
}

export interface GetUserProgressCommand {
  userId: string;
  /** 进度覆盖范围按所选科目；coverage.publishedTotal / learnedCount 按此科目统计 */
  subjectId: string;
  /** 可注入时钟（测试用）；缺省取当前时间 */
  now?: Date;
}

export interface DueItem {
  knowledgePointId: string;
  dueAt: Date;
  stability: number;
}

/** 薄弱项触发原因（最小可行集；任一命中即进入 weakList） */
export type WeakReason =
  | { type: "again"; /** 历史上评 again 的次数（来自 ReviewEvent） */ count: number }
  | { type: "lapse"; /** FSRS 累计遗忘次数（来自 LearningState.lapseCount） */ lapseCount: number }
  | { type: "low_stability"; /** 当前稳定性低于阈值（天） */ stability: number };

export interface WeakItem {
  knowledgePointId: string;
  /** 触发原因（可能多条同时命中） */
  reasons: WeakReason[];
}

/** 稳定性区间计数（单位：天）。total = 该用户 LearningState 总数。 */
export interface StabilityDistribution {
  /** stability < 1 天 */
  lt1day: number;
  /** 1 <= stability < 7 天 */
  d1to7days: number;
  /** 7 <= stability < 30 天 */
  d7to30days: number;
  /** stability >= 30 天 */
  gte30days: number;
  total: number;
}

export interface GetUserProgressResult {
  coverage: {
    subjectId: string;
    /** 该科目下已发布 KnowledgePoint 总数 */
    publishedTotal: number;
    /** 其中用户已学（存在 LearningState）的数量 */
    learnedCount: number;
  };
  /** 累计复习次数（ReviewEvent 总数） */
  reviewedCount: number;
  /** 到期需复习列表（dueAt <= now，按 dueAt 升序） */
  dueList: DueItem[];
  /** 薄弱知识点（任务 C） */
  weakList: WeakItem[];
  stabilityDistribution: StabilityDistribution;
}

export class GetUserProgress {
  constructor(private readonly deps: GetUserProgressDeps) {}

  async execute(cmd: GetUserProgressCommand): Promise<GetUserProgressResult> {
    const { learningStates, reviewEvents, knowledgePoints } = this.deps;
    const now = cmd.now ?? new Date();

    // 三个读路径并行（无写、无事务）
    const [allStates, reviewEventsForUser, publishedTotal] = await Promise.all([
      learningStates.findAllByUser(cmd.userId),
      reviewEvents.findAllByUser(cmd.userId),
      knowledgePoints.countPublishedBySubject(cmd.subjectId),
    ]);

    // reviewedCount：一条 ReviewEvent 对应一次 FinalizeReview（BR-030），即一次复习
    const reviewedCount = reviewEventsForUser.length;

    // dueList：到期状态按 dueAt 升序（复用 findDue 带上限，避免无限增长）
    const dueRows = await learningStates.findDue(cmd.userId, now, DUE_LIST_LIMIT);
    const dueList: DueItem[] = dueRows.map((s) => ({
      knowledgePointId: s.knowledgePointId,
      dueAt: s.dueAt,
      stability: s.stability,
    }));

    // again 次数按知识点聚合（ReviewEvent 历史 → 薄弱证据）
    const againCountByKp = new Map<string, number>();
    for (const ev of reviewEventsForUser) {
      if (ev.rating === "again") {
        againCountByKp.set(ev.knowledgePointId, (againCountByKp.get(ev.knowledgePointId) ?? 0) + 1);
      }
    }

    // weakList：最小可行判定集（任务 C）
    //   1) 历史上评过 again（againCount > 0）
    //   2) FSRS lapseCount > 0（曾遗忘）
    //   3) stability < 阈值（天）
    const weakList: WeakItem[] = [];
    for (const s of allStates) {
      const reasons: WeakReason[] = [];
      const againCount = againCountByKp.get(s.knowledgePointId) ?? 0;
      if (againCount > 0) {
        reasons.push({ type: "again", count: againCount });
      }
      if (s.lapseCount > 0) {
        reasons.push({ type: "lapse", lapseCount: s.lapseCount });
      }
      if (s.stability < WEAK_STABILITY_THRESHOLD_DAYS) {
        reasons.push({ type: "low_stability", stability: s.stability });
      }
      if (reasons.length > 0) {
        weakList.push({ knowledgePointId: s.knowledgePointId, reasons });
      }
    }

    // 稳定性分布概览（不折叠成单一 mastery 百分比）
    const dist: StabilityDistribution = {
      lt1day: 0,
      d1to7days: 0,
      d7to30days: 0,
      gte30days: 0,
      total: allStates.length,
    };
    for (const s of allStates) {
      if (s.stability < 1) dist.lt1day++;
      else if (s.stability < 7) dist.d1to7days++;
      else if (s.stability < 30) dist.d7to30days++;
      else dist.gte30days++;
    }

    // learnedCount：该用户在该科目下已学的 published 知识点数（subject 维度精确计数）
    const learnedCount = await learningStates.countLearnedByUserAndSubject(
      cmd.userId,
      cmd.subjectId
    );

    return {
      coverage: {
        subjectId: cmd.subjectId,
        publishedTotal,
        learnedCount,
      },
      reviewedCount,
      dueList,
      weakList,
      stabilityDistribution: dist,
    };
  }
}
