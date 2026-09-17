/**
 * Scheduler 接口 —— FSRS 只是其中一种实现（架构文档 §19）。
 * Scheduler 只做一件事：
 *   给定 previous state + rating + now，计算 next state。
 * 不读 cookie、不查 React、不生成 HTTP 响应、不写 StudyPlan、不决定 UI 文案。
 */

import type { ReviewRating } from "@/shared/types/rating";
import type { LearningStateDraft } from "./learning-state";

export interface Scheduler {
  initialize(now: Date): LearningStateDraft;
  review(
    previous: LearningStateDraft,
    rating: ReviewRating,
    now: Date
  ): LearningStateDraft;
}
