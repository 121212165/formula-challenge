/**
 * StudyPlan / StudyPlanItem —— 系统对某用户某本地日期的学习建议。
 * Plan 不拥有掌握度：完成 plan item 只记录任务完成，不修改 LearningState（BR-062）。
 */

export type StudyPlanSource = "scheduler" | "ai" | "manual";
export type StudyPlanStatus = "draft" | "active" | "completed" | "expired";
export type StudyPlanItemType = "new" | "review" | "weakness";
export type StudyPlanItemStatus = "pending" | "completed" | "skipped";

export interface StudyPlan {
  id: string;
  userId: string;
  /** "YYYY-MM-DD"，用户时区；UNIQUE(userId, localDate)（BR-060） */
  localDate: string;
  source: StudyPlanSource;
  status: StudyPlanStatus;
}

export interface StudyPlanItem {
  id: string;
  planId: string;
  knowledgePointId: string;
  type: StudyPlanItemType;
  reason: string;
  position: number;
  status: StudyPlanItemStatus;
}
