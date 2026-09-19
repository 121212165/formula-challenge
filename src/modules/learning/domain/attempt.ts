/**
 * Attempt —— 一次真实作答。提交后是事实记录，不被重新解释（BR-003 / BR-011）。
 * Attempt 不决定 FSRS 状态，不自动创建 ReviewEvent。
 */

export type AttemptStatus = "submitted" | "evaluated" | "reviewed";

/**
 * Attempt 是事实记录（BR-003）：提交后不得被悄悄改写。
 * 字段全部 readonly，且经 createImmutableAttempt 构造的实例在运行时被 Object.freeze，
 * 防止领域服务/仓储在落库前对已确定的作答事实做隐蔽二次赋值。
 */
export interface Attempt {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly sessionItemId: string;
  readonly questionInstanceId: string;
  readonly knowledgePointId: string;
  readonly userAnswer: string;
  readonly startedAt: Date;
  readonly submittedAt: Date;
  readonly timeSpentSeconds: number;
  readonly status: AttemptStatus;
  /** 幂等键：同一用户同一 clientRequestId 不得产生第二个 Attempt（BR-012） */
  readonly clientRequestId: string;
}

/**
 * 不可变 Attempt 工厂：把已组装好的事实冻结成不可变对象后返回。
 * - 运行时：Object.freeze 使任何字段赋值静默失效（严格模式抛 TypeError）。
 * - 结构兼容：调用方仍可传普通对象字面量，冻结不改变形状，既有仓储照常消费。
 * 状态推进不走"原地改 status"，而由仓储 updateStatus 写新记录表达（BR-013）。
 */
export function createImmutableAttempt(data: Attempt): Attempt {
  return Object.freeze({ ...data });
}

export function canTransitionAttempt(from: AttemptStatus, to: AttemptStatus): boolean {
  const order: Record<AttemptStatus, number> = { submitted: 0, evaluated: 1, reviewed: 2 };
  return order[to] === order[from] + 1;
}
