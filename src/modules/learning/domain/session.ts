/**
 * StudySession / SessionItem —— 一次有边界的学习活动。
 * Session 拥有时间与模式，不拥有记忆调度（BR-050 ~ BR-053）。
 */

export type StudySessionMode = "daily" | "review" | "free" | "topic" | "diagnostic";
export type StudySessionStatus = "active" | "completed" | "abandoned";

export interface StudySession {
  id: string;
  userId: string;
  subjectId: string;
  mode: StudySessionMode;
  startedAt: Date;
  endedAt: Date | null;
  status: StudySessionStatus;
  durationSeconds: number;
}

export type SessionItemStatus = "pending" | "active" | "completed" | "skipped";

export interface SessionItem {
  id: string;
  sessionId: string;
  knowledgePointId: string;
  position: number;
  status: SessionItemStatus;
  questionInstanceId: string | null;
}

/** 禁止 completed/abandoned → active（架构文档 §36） */
export function canTransitionSession(from: StudySessionStatus, to: StudySessionStatus): boolean {
  if (from === "active" && (to === "completed" || to === "abandoned")) return true;
  return false;
}

/**
 * SessionItem 状态机（Phase 8 焦点 5）。
 * 合法路径：pending → active → completed；pending/active → skipped。
 * 禁止 pending → completed 直跳（必须先 active）。
 */
export function canTransitionSessionItem(from: SessionItemStatus, to: SessionItemStatus): boolean {
  const legal: Record<SessionItemStatus, SessionItemStatus[]> = {
    pending: ["active", "skipped"],
    active: ["completed", "skipped"],
    completed: [],
    skipped: [],
  };
  return legal[from]?.includes(to) ?? false;
}
