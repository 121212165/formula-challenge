/**
 * 确定性出题器（question-model.md §3 / §4）。
 *
 * 三种已落地题型：free_recall / fill_blank / recognition。
 * ordering 本轮不实现 —— 注册表故意不登记，缺题器即显式报错，
 * 绝不静默退化为 free_recall（§3.4）。
 */

import { ValidationError } from "@/shared/errors";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { QuestionTemplate, QuestionType } from "./question";
import type { RenderedQuestion } from "./rendered-question";
import { normalizeAnswer } from "./scoring";
import {
  parseDistractors,
  parseOptionsPerQuestion,
  parseRequiredRatio,
  parseSeparator,
  renderFillBlankStem,
  resolveFillBlankSlots,
  type SynonymMap,
} from "./template-config";

export interface GenerateContext {
  knowledgePoint: KnowledgePoint;
  template: QuestionTemplate;
  /** 同一 SessionItem 下的题号，用于确定性选空位/排选项 */
  sequence: number;
  /** 同知识点类型的其他已发布 KP（recognition 干扰项来源），可选 */
  siblings?: KnowledgePoint[];
  /** 科目级同义词（挖空 accept 扩展），缺省空 */
  synonyms?: SynonymMap;
}

export interface QuestionGenerator {
  readonly type: QuestionType;
  generate(ctx: GenerateContext): Promise<RenderedQuestion>;
}

/* ------------------------- free_recall ------------------------- */

export class FreeRecallGenerator implements QuestionGenerator {
  readonly type = "free_recall" as const;

  async generate(ctx: GenerateContext): Promise<RenderedQuestion> {
    const separator = parseSeparator(ctx.template.config);
    const requiredRatio = parseRequiredRatio(ctx.template.config);
    const acceptedAnswers = ctx.knowledgePoint.canonicalAnswer
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return {
      kind: "free_recall",
      // 题干固定为"复述 {title}"（§3.1）
      stem: `复述：${ctx.knowledgePoint.title}`,
      acceptedAnswers,
      requiredRatio,
    };
  }
}

/* ------------------------- fill_blank ------------------------- */

export class FillBlankGenerator implements QuestionGenerator {
  readonly type = "fill_blank" as const;

  async generate(ctx: GenerateContext): Promise<RenderedQuestion> {
    const synonyms = ctx.synonyms ?? {};
    const blanks = resolveFillBlankSlots(
      ctx.knowledgePoint,
      ctx.template.config,
      ctx.sequence,
      synonyms
    );
    if (blanks.length === 0) {
      throw new ValidationError("填空模板未配置可接受答案");
    }
    const stem = renderFillBlankStem(
      ctx.knowledgePoint,
      ctx.template.config,
      ctx.sequence,
      synonyms
    );
    return { kind: "fill_blank", stem, blanks };
  }
}

/* ------------------------- recognition ------------------------- */

/** 稳定字符串哈希（FNV-1a），用于确定性排选项顺序，与运行时随机数无关 */
function stableHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RecognitionGenerator implements QuestionGenerator {
  readonly type = "recognition" as const;

  async generate(ctx: GenerateContext): Promise<RenderedQuestion> {
    const correct = ctx.knowledgePoint.canonicalAnswer.trim();
    const normCorrect = normalizeAnswer(correct);

    // 干扰项池：模板 curated 池 ∪ 同类型其他已发布 KP 的 canonical（§3.3）
    const pool = new Set<string>(parseDistractors(ctx.template.config));
    for (const sib of ctx.siblings ?? []) {
      if (sib.id === ctx.knowledgePoint.id) continue;
      const c = sib.canonicalAnswer.trim();
      if (c) pool.add(c);
    }

    // 去重、剔除与正确项归一化后相同者，保证"看似合理但确实错"
    const distractors: string[] = [];
    const seen = new Set<string>([normCorrect]);
    for (const d of pool) {
      const nd = normalizeAnswer(d);
      if (!nd || seen.has(nd)) continue;
      seen.add(nd);
      distractors.push(d);
    }

    if (distractors.length === 0) {
      throw new ValidationError("识别题缺少可用干扰项（需同类型其他已发布 KP 或 config.distractors）");
    }

    const total = Math.min(parseOptionsPerQuestion(ctx.template.config), distractors.length + 1);
    const picked = distractors.slice(0, total - 1);

    // 确定性排序：按 hash(sequence + 文本) 排序，正确项位置可复现
    const options = [correct, ...picked]
      .map((text) => ({ text, h: stableHash(`${ctx.sequence}:${text}`) }))
      .sort((a, b) => a.h - b.h)
      .map((x) => x.text);

    const correctIndex = options.findIndex((o) => normalizeAnswer(o) === normCorrect);
    if (correctIndex < 0) {
      throw new ValidationError("识别题渲染异常：正确项未出现在选项中");
    }

    return {
      kind: "recognition",
      stem: `请选择正确答案：${ctx.knowledgePoint.title}`,
      options,
      correctIndex,
      correctAnswer: correct,
    };
  }
}
