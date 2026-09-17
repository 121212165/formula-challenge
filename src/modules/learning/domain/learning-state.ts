/**
 * LearningState —— 一个用户对一个知识点的当前记忆状态（BR-040）。
 * 只存当前调度状态；历史属于 ReviewEvent。
 */

import type { ReviewRating } from "@/shared/types/rating";

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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scheduler 的输入/输出状态表示（不含用户/知识点/审计字段）。
 * 领域层通过 createInitialLearningState 显式初始化，不散落 null（learning-model §11）。
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
}

export function createInitialLearningStateDraft(now: Date): LearningStateDraft {
  return {
    stability: 0,
    difficulty: 0,
    retrievability: 1,
    dueAt: now,
    lastReviewedAt: null,
    reviewCount: 0,
    lapseCount: 0,
    lastRating: null,
  };
}
