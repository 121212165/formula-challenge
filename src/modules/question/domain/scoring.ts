/**
 * 纯评分函数 —— 题型无关的归一化与比对原语。
 *
 * 契约（question-model.md §2.3 / BR-021）：统一返回 EvaluationResult
 * { score, isCorrect, confidence, feedback }。
 * 关键不变量（BR-022）：本文件零 LearningState 引用，只产出评价结果，不写任何状态。
 */

import type { EvaluationResult } from "@/modules/learning/domain/evaluation";
import type { FillBlankSlot } from "./rendered-question";

/**
 * 归一化：NFKC 全角转半角 → 去全部空白与中英文标点 → 小写。
 * 与 learning/application/evaluator.ts 的 normalizeAnswer 保持同一语义，
 * question 模块自持有一份，避免 domain 反向依赖 application 层。
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKC")
    .replace(
      /[\s，。、；：！？·—–\-—（）()【】\[\]《》〈〉"'“”‘’、,.;:!?]/g,
      ""
    )
    .toLowerCase();
}

function wrong(score: number, feedback: string, confidence = 1): EvaluationResult {
  return { score, isCorrect: false, confidence, feedback };
}

/* ------------------------- free_recall ------------------------- */

export interface FreeRecallScoreInput {
  /** 知识点 canonicalAnswer */
  canonicalAnswer: string;
  /** 候选答案分隔符，默认支持 "/" 与 "|" */
  separator?: RegExp;
  /** 命中比例阈值（0~1），默认 1 */
  requiredRatio?: number;
  userAnswer: string;
}

/**
 * free_recall：归一化后候选答案包含匹配，支持多候选（/、| 分隔）与命中比例。
 */
export function scoreFreeRecall(input: FreeRecallScoreInput): EvaluationResult {
  const separator = input.separator ?? /[\/|]/;
  const requiredRatio = input.requiredRatio ?? 1;

  const user = normalizeAnswer(input.userAnswer);
  if (!user) {
    return wrong(0, "答案为空");
  }

  const candidates = input.canonicalAnswer
    .split(separator)
    .map((s) => normalizeAnswer(s))
    .filter((s) => s.length > 0);

  if (candidates.length === 0) {
    return { score: 0, isCorrect: false, confidence: 0.5, feedback: null };
  }

  const hits = candidates.filter(
    (c) => user.includes(c) || c.includes(user)
  ).length;
  const ratio = hits / candidates.length;
  const isCorrect = ratio >= requiredRatio;

  return {
    score: ratio,
    isCorrect,
    confidence: candidates.length === 1 ? 0.9 : 0.7,
    feedback: isCorrect ? null : `参考答案：${input.canonicalAnswer}`,
  };
}

/* ------------------------- fill_blank ------------------------- */

export interface FillBlankScoreInput {
  blanks: FillBlankSlot[];
  /** 单个空为字符串；多空为按分隔符拆开的字符串数组 */
  userAnswer: string | string[];
}

/**
 * fill_blank：逐空归一化后精确匹配，空位 accept 支持同义词数组（任一命中即对）。
 * 得分 = 答对空位数 / 总空位数；全部答对才 isCorrect。
 */
export function scoreFillBlank(input: FillBlankScoreInput): EvaluationResult {
  const { blanks } = input;
  if (blanks.length === 0) {
    return wrong(0, "题目没有空位", 0.5);
  }

  // 把作答统一成"逐空字符串数组"
  let answers: string[];
  if (Array.isArray(input.userAnswer)) {
    answers = input.userAnswer;
  } else if (blanks.length === 1) {
    answers = [input.userAnswer];
  } else {
    answers = input.userAnswer.split(/[、，,;；|]/).map((s) => s.trim());
  }

  let correct = 0;
  for (let i = 0; i < blanks.length; i++) {
    const slot = blanks[i];
    if (!slot) continue;
    const given = normalizeAnswer(answers[i] ?? "");
    if (!given) continue;
    const hit = slot.accept.some((a) => normalizeAnswer(a) === given);
    if (hit) correct++;
  }

  const ratio = correct / blanks.length;
  const isCorrect = ratio >= 1;
  return {
    score: ratio,
    isCorrect,
    confidence: 1,
    feedback: isCorrect
      ? null
      : `正确答案：${blanks
          .map((s) => s.accept[0] ?? "")
          .filter((s) => s.length > 0)
          .join("、")}`,
  };
}

/* ------------------------- recognition ------------------------- */

export interface RecognitionScoreInput {
  /** 正确项文本（= canonicalAnswer） */
  correctAnswer: string;
  userAnswer: string;
}

/**
 * recognition：用户所选选项与正确项归一化后精确相等即对。
 * 干扰项只在渲染期使用，评分不看干扰项。
 */
export function scoreRecognition(input: RecognitionScoreInput): EvaluationResult {
  const user = normalizeAnswer(input.userAnswer);
  if (!user) {
    return wrong(0, "未选择选项");
  }
  const correct = normalizeAnswer(input.correctAnswer);
  const isCorrect = correct.length > 0 && user === correct;
  return {
    score: isCorrect ? 1 : 0,
    isCorrect,
    confidence: 1,
    feedback: isCorrect ? null : `正确答案：${input.correctAnswer}`,
  };
}
