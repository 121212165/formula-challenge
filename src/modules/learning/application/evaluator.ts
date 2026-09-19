/**
 * Evaluator —— 判断作答质量（BR-021）。
 * FormulaEvaluator / HerbEvaluator / AcupointEvaluator 都输出统一 EvaluationResult。
 * Evaluator 只评分，不更新任何状态。
 */

import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { QuestionType } from "@/modules/question/domain/question";
import type { EvaluationResult } from "../domain/evaluation";

export interface EvaluationContext {
  knowledgePoint: KnowledgePoint;
  questionType: QuestionType;
  userAnswer: string;
  /**
   * 命中模板的 config（question-model.md §2.1 Json?）。
   * fill_blank 读空位/可接受答案，free_recall 读分隔符与命中比例。
   * 可选：缺省时走题型默认值；旧调用方（CanonicalMatchEvaluator）不感知。
   */
  templateConfig?: unknown;
  /** 题目实例题号，fill_blank 用于确定性复算"挖了第几项"。可选，缺省 0。 */
  instanceSequence?: number;
}

export interface Evaluator {
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;
}

/** 归一化：去空白/标点、统一大小写，用于宽松比较 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s，。、；：！？·—–-]/g, "")
    .toLowerCase();
}

/**
 * 默认评估器：与 canonicalAnswer 归一化后匹配即判对（BR-021）。
 * 答案拆成多个可选项（如方剂组成可多组同义），任一组命中即正确。
 */
export class CanonicalMatchEvaluator implements Evaluator {
  constructor(
    private readonly options: {
      /** canonicalAnswer 内的候选分隔符，默认支持 / 或 | */
      separator?: RegExp;
      /** 多选命中比例阈值（0~1），默认 1（全部命中才算对） */
      requiredRatio?: number;
    } = {}
  ) {}

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const { knowledgePoint, userAnswer } = context;
    const separator = this.options.separator ?? /[\/|]/;
    const requiredRatio = this.options.requiredRatio ?? 1;

    const candidates = knowledgePoint.canonicalAnswer
      .split(separator)
      .map((s) => normalizeAnswer(s))
      .filter((s) => s.length > 0);

    const user = normalizeAnswer(userAnswer);
    if (!user) {
      return { score: 0, isCorrect: false, confidence: 1, feedback: "答案为空" };
    }

    if (candidates.length === 0) {
      return { score: 0, isCorrect: false, confidence: 0.5, feedback: null };
    }

    const hits = candidates.filter((c) => user.includes(c) || c.includes(user)).length;
    const ratio = hits / candidates.length;
    const isCorrect = ratio >= requiredRatio;

    return {
      score: ratio,
      isCorrect,
      confidence: candidates.length === 1 ? 0.9 : 0.7,
      feedback: isCorrect ? null : `参考答案：${knowledgePoint.canonicalAnswer}`,
    };
  }
}
