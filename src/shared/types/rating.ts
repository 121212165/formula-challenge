/**
 * 记忆评级（Learner memory judgment）
 * 与 Evaluation（系统评分）严格分离。
 * ReviewEvent 的唯一合法评级输入。
 */
export type ReviewRating = "again" | "hard" | "good" | "easy";

export const REVIEW_RATINGS: readonly ReviewRating[] = ["again", "hard", "good", "easy"] as const;

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === "string" && (REVIEW_RATINGS as readonly string[]).includes(value);
}
