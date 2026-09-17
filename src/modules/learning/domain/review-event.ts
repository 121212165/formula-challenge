/**
 * ReviewEvent —— 用户最终记忆评级，Scheduler 的输入。
 * 一个 Attempt 最多一个 ReviewEvent（BR-030），数据库 UNIQUE(attemptId)。
 * 一个 ReviewEvent 只更新一次 LearningState（BR-034）。
 */

import type { ReviewRating } from "@/shared/types/rating";

export interface ReviewStateSnapshot {
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: Date;
  reviewCount: number;
  lapseCount: number;
  lastRating: ReviewRating | null;
}

export interface ReviewEvent {
  id: string;
  attemptId: string;
  userId: string;
  knowledgePointId: string;
  rating: ReviewRating;
  reviewedAt: Date;
  previousState: ReviewStateSnapshot;
  nextState: ReviewStateSnapshot;
}
