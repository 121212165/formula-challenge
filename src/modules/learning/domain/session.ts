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
