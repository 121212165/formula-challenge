/**
 * Attempt —— 一次真实作答。提交后是事实记录，不被重新解释（BR-003 / BR-011）。
 * Attempt 不决定 FSRS 状态，不自动创建 ReviewEvent。
 */

export type AttemptStatus = "submitted" | "evaluated" | "reviewed";

export interface Attempt {
  id: string;
  userId: string;
  sessionId: string;
  sessionItemId: string;
  questionInstanceId: string;
  knowledgePointId: string;
  userAnswer: string;
  startedAt: Date;
  submittedAt: Date;
  timeSpentSeconds: number;
  status: AttemptStatus;
  /** 幂等键：同一用户同一 clientRequestId 不得产生第二个 Attempt（BR-012） */
  clientRequestId: string;
}

export function canTransitionAttempt(from: AttemptStatus, to: AttemptStatus): boolean {
  const order: Record<AttemptStatus, number> = { submitted: 0, evaluated: 1, reviewed: 2 };
  return order[to] === order[from] + 1;
}
