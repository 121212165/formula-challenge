/**
 * Evaluation —— 系统对作答质量的判断。
 * 不等于用户记忆评级；绝不直接更新 LearningState（BR-022）。
 */

export interface Evaluation {
  id: string;
  attemptId: string;
  score: number;
  isCorrect: boolean;
  confidence: number;
  feedback: string | null;
  createdAt: Date;
}

/**
 * 所有科目评估器统一输出契约（BR-021）。
 */
export interface EvaluationResult {
  score: number;
  isCorrect: boolean;
  confidence: number;
  feedback: string | null;
}
