/**
 * ReviewEvent —— 用户最终记忆评级，Scheduler 的输入。
 * 一个 Attempt 最多一个 ReviewEvent（BR-030），数据库 UNIQUE(attemptId)。
 * 一个 ReviewEvent 只更新一次 LearningState（BR-034）。
 *
 * ReviewEvent 是不可变事实：含前后状态快照，一经生成不得被篡改。
 */

import type { ReviewRating } from "@/shared/types/rating";

export interface ReviewStateSnapshot {
  readonly stability: number;
  readonly difficulty: number;
  readonly retrievability: number;
  readonly dueAt: Date;
  readonly lastReviewedAt: Date | null;
  readonly reviewCount: number;
  readonly lapseCount: number;
  readonly lastRating: ReviewRating | null;
  /** FSRS 卡片状态机原值（State.New/Learning/Review/Relearning），审计快照的一部分 */
  readonly fsrsState: number;
}

export interface ReviewEvent {
  readonly id: string;
  readonly attemptId: string;
  readonly userId: string;
  readonly knowledgePointId: string;
  readonly rating: ReviewRating;
  readonly reviewedAt: Date;
  readonly previousState: ReviewStateSnapshot;
  readonly nextState: ReviewStateSnapshot;
}

/**
 * 不可变 ReviewEvent 工厂：冻结事件本体，并深冻结前后两个状态快照，
 * 防止审计快照在落库前被意外改写（BR-034 的一次评级只对应一组快照）。
 * 结构与普通对象字面量完全兼容，既有仓储无需改动。
 */
export function createImmutableReviewEvent(data: ReviewEvent): ReviewEvent {
  return Object.freeze({
    ...data,
    previousState: Object.freeze({ ...data.previousState }),
    nextState: Object.freeze({ ...data.nextState }),
  });
}
