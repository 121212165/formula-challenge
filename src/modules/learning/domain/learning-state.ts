/**
 * LearningState —— 一个用户对一个知识点的当前记忆状态（BR-040）。
 * 只存当前调度状态；历史属于 ReviewEvent。
 */

import type { ReviewRating } from "@/shared/types/rating";
import { ValidationError } from "@/shared/errors";

export interface LearningState {
  id: string;
  userId: string;
  knowledgePointId: string;
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lapseCount: number;
  lastRating: ReviewRating | null;
  /** FSRS 卡片状态机原值（State.New/Learning/Review/Relearning），见 LearningStateDraft.fsrsState */
  fsrsState: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scheduler 的输入/输出状态表示（不含用户/知识点/审计字段）。
 * 领域层通过 Scheduler.initialize() 显式初始化，不散落 null（learning-model §11 / BR-042）。
 */
export interface LearningStateDraft {
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lapseCount: number;
  lastRating: ReviewRating | null;
  /**
   * FSRS 卡片状态机原值（ts-fsrs State 枚举：New=0 / Learning=1 / Review=2 / Relearning=3）。
   * 持久化以便还原卡片时不硬编码为 Review 态（P2-3 保真）。
   */
  fsrsState: number;
}

/**
 * LearningState 的唯一构造入口（单一工厂，避免散落在用例里手写对象字面量）。
 *
 * 它把 Scheduler 产出的 LearningStateDraft + 归属/审计字段组装成 LearningState。
 *
 * UNIQUE(userId, knowledgePointId) 语义（BR-040）：
 *   一个用户对一个知识点全局只有一条 LearningState，数据库以此建唯一索引。
 *   这里在应用层显式表达该不变量——归属标识为空意味着无法定位这条状态、
 *   也无从满足唯一索引，直接抛 ValidationError，而非产出一条悬挂记录。
 */
export interface LearningStateFromDraftInput {
  userId: string;
  knowledgePointId: string;
  /** Scheduler.initialize() / review() 的输出 */
  draft: LearningStateDraft;
  id: string;
  /** 首次落库时间；更新既有状态时应传入原记录的 createdAt */
  createdAt: Date;
  /** 本次更新时间；缺省取 createdAt（即首次创建） */
  updatedAt?: Date;
}

export function LearningStateFromDraft(input: LearningStateFromDraftInput): LearningState {
  // UNIQUE(userId, knowledgePointId) 应用层保护：空归属直接拒绝。
  if (!input.userId) {
    throw new ValidationError("LearningState.userId 不能为空（违反 UNIQUE(userId, knowledgePointId)）");
  }
  if (!input.knowledgePointId) {
    throw new ValidationError(
      "LearningState.knowledgePointId 不能为空（违反 UNIQUE(userId, knowledgePointId)）"
    );
  }

  const { draft } = input;
  return {
    id: input.id,
    userId: input.userId,
    knowledgePointId: input.knowledgePointId,
    stability: draft.stability,
    difficulty: draft.difficulty,
    retrievability: draft.retrievability,
    dueAt: draft.dueAt,
    lastReviewedAt: draft.lastReviewedAt,
    reviewCount: draft.reviewCount,
    lapseCount: draft.lapseCount,
    lastRating: draft.lastRating,
    fsrsState: draft.fsrsState,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}


