/**
 * RenderedQuestion —— 出题器依据 KnowledgePoint 结构化字段即时产出的"这道题"。
 *
 * 设计（question-model.md §2.2）：QuestionInstance 只存指针（knowledgePointId /
 * templateId / sequence），渲染后的题干/选项/可接受答案由出题器即时产出；
 * 评分器只消费这里产出的结构，不关心渲染细节。
 *
 * AI 兜底生成（Phase 11）将复用同一组结构；AI 输出必须经 question-model.md §5
 * 校验（指向已发布知识点 / 题型合法 / 答案可验证 / 无医疗违规）后方可落库渲染。
 */

/** free_recall：开放作答，归一化后与 canonical 候选做包含匹配 */
export interface FreeRecallQuestion {
  readonly kind: "free_recall";
  /** 题干，固定形如"复述：{title}" */
  readonly stem: string;
  /** 从 canonicalAnswer 按分隔符拆出的候选答案（已含多组同义） */
  readonly acceptedAnswers: string[];
  /** 命中比例阈值（0~1），默认 1（全部候选命中才算对） */
  readonly requiredRatio: number;
}

/** fill_blank：一个空位的可接受答案（同义词数组，任一命中即对） */
export interface FillBlankSlot {
  /** 题干中空位占位符，约定为 "____" */
  readonly slot: string;
  /** 该空位可接受的答案，第 0 项为 canonical，其余为同义词 */
  readonly accept: string[];
}

/** fill_blank：题干含空位，逐空精确匹配 */
export interface FillBlankQuestion {
  readonly kind: "fill_blank";
  readonly stem: string;
  readonly blanks: FillBlankSlot[];
}

/** recognition：单选题，用户所选 === 正确项 */
export interface RecognitionQuestion {
  readonly kind: "recognition";
  readonly stem: string;
  /** 选项列表（含正确项，已确定性排序） */
  readonly options: string[];
  /** 正确项在 options 中的下标 */
  readonly correctIndex: number;
  /** 正确项文本（= canonicalAnswer），评分只比它 */
  readonly correctAnswer: string;
}

export type RenderedQuestion =
  | FreeRecallQuestion
  | FillBlankQuestion
  | RecognitionQuestion;
