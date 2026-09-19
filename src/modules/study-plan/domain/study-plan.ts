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

/**
 * StudyPlan 状态机（Phase 1 焦点 3 / 架构文档 §24）。
 * 合法路径：draft → active → completed；active → expired（过期未完成）。
 * 生成时必须先建 draft，再显式激活到 active；禁止生成即 active。
 */
export function canTransitionPlan(from: StudyPlanStatus, to: StudyPlanStatus): boolean {
  const legal: Record<StudyPlanStatus, StudyPlanStatus[]> = {
    draft: ["active"],
    active: ["completed", "expired"],
    completed: [],
    expired: [],
  };
  return legal[from]?.includes(to) ?? false;
}

/**
 * StudyPlanItem 状态机（Phase 9）。
 * 注意：item 没有 active 态；合法路径只有 pending → completed / pending → skipped，
 * completed / skipped 均为终态。CompletePlanItem / SkipPlanItem 走本守卫。
 */
export function canTransitionPlanItem(
  from: StudyPlanItemStatus,
  to: StudyPlanItemStatus
): boolean {
  const legal: Record<StudyPlanItemStatus, StudyPlanItemStatus[]> = {
    pending: ["completed", "skipped"],
    completed: [],
    skipped: [],
  };
  return legal[from]?.includes(to) ?? false;
}
