/**
 * 题型注册表（question-model.md §6 —— 题型扩展解耦）。
 *
 * 新增题型 = 在 Map 里加一条 { generator }，不动 Scheduler / FSRS /
 * LearningState / ReviewEvent（BR-040 / BR-022）。学习引擎只消费
 * Evaluation.isCorrect，不感知题型。
 *
 * ordering 本轮故意不登记：访问 register.get("ordering") 返回 null，
 * GenerateQuestion / SubjectEvaluator 据此显式报错，绝不静默退化（§3.4）。
 */

import type { QuestionType } from "./question";
import {
  FillBlankGenerator,
  FreeRecallGenerator,
  RecognitionGenerator,
  type QuestionGenerator,
} from "./generator";

export interface QuestionEntry {
  generator: QuestionGenerator;
}

export interface QuestionRegistry {
  get(type: QuestionType): QuestionEntry | null;
  has(type: QuestionType): boolean;
  /** 已登记题型（调试/报告用） */
  registered(): QuestionType[];
}

export function buildDefaultQuestionRegistry(): QuestionRegistry {
  const map = new Map<QuestionType, QuestionEntry>();
  map.set("free_recall", { generator: new FreeRecallGenerator() });
  map.set("fill_blank", { generator: new FillBlankGenerator() });
  map.set("recognition", { generator: new RecognitionGenerator() });
  // ordering：预留，本轮不登记
  return {
    get: (t) => map.get(t) ?? null,
    has: (t) => map.has(t),
    registered: () => [...map.keys()],
  };
}
