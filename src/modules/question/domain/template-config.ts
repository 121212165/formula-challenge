/**
 * QuestionTemplate.config 的安全解析 + 确定性挖空求解。
 *
 * config 在 DB 是 Json?（question-model.md §2.1），领域侧不做泛型强约束，
 * 由出题器/评分器各自解释；本模块把"如何解释"收敛到一处，保证生成与评分同源。
 */

import { ValidationError } from "@/shared/errors";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { FillBlankSlot } from "./rendered-question";

export type SynonymMap = Record<string, string[]>;

function asRecord(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}

/** free_recall 候选分隔符（config.separator 为 RegExp 源字符串，缺省 /、|） */
export function parseSeparator(config: unknown): RegExp {
  const c = asRecord(config);
  const s = c.separator;
  if (typeof s === "string" && s.length > 0) return new RegExp(s);
  return /[\/|]/;
}

/** free_recall 命中比例阈值，缺省 1 */
export function parseRequiredRatio(config: unknown): number {
  const c = asRecord(config);
  const r = c.requiredRatio;
  return typeof r === "number" && r >= 0 && r <= 1 ? r : 1;
}

/** recognition 每题选项数（含正确项），缺省 4 */
export function parseOptionsPerQuestion(config: unknown): number {
  const c = asRecord(config);
  const n = c.optionsPerQuestion;
  return typeof n === "number" && n >= 2 ? n : 4;
}

/** recognition 模板内置干扰项池（curated） */
export function parseDistractors(config: unknown): string[] {
  const c = asRecord(config);
  const d = c.distractors;
  if (!Array.isArray(d)) return [];
  return d.filter((x): x is string => typeof x === "string");
}

/** 把同义词并入可接受答案，去重保序 */
function expandSynonyms(accept: string[], synonyms: SynonymMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of accept) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
    const extra = synonyms[a];
    if (Array.isArray(extra)) {
      for (const s of extra) {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
  }
  return out;
}

/**
 * 求解 fill_blank 的空位与可接受答案（生成与评分共用，保证同源）。
 *
 * - config.blanks 显式给出：直接采用其 accept（并入同义词）。
 * - 否则从 canonical 句子按 itemSeparator（默认 "、"）拆出结构化项，
 *   挖去第 blankIndex 项（缺省 sequence % 项数），正确答案=被挖项。
 */
export function resolveFillBlankSlots(
  kp: KnowledgePoint,
  config: unknown,
  sequence: number,
  synonyms: SynonymMap
): FillBlankSlot[] {
  const c = asRecord(config);

  if (Array.isArray(c.blanks)) {
    return c.blanks
      .map((raw) => {
        const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const accept = Array.isArray(b.accept)
          ? (b.accept as unknown[]).filter((x): x is string => typeof x === "string")
          : [];
        return {
          slot: typeof b.slot === "string" ? b.slot : "____",
          accept: expandSynonyms(accept, synonyms),
        };
      })
      .filter((s) => s.accept.length > 0);
  }

  const itemSep = typeof c.itemSeparator === "string" ? c.itemSeparator : "、";
  const items = kp.canonicalAnswer
    .split(itemSep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (items.length < 2) {
    throw new ValidationError("知识点缺少可挖空的结构化内容（canonical 不足两项）");
  }
  const rawIdx = typeof c.blankIndex === "number" ? c.blankIndex : sequence;
  const idx = ((rawIdx % items.length) + items.length) % items.length;
  const dug = items[idx];
  if (!dug) {
    throw new ValidationError("挖空下标越界");
  }
  return [{ slot: "____", accept: expandSynonyms([dug], synonyms) }];
}

/** 由 canonical 句子渲染 fill_blank 题干（把被挖项替换为 "____"） */
export function renderFillBlankStem(
  kp: KnowledgePoint,
  config: unknown,
  sequence: number,
  synonyms: SynonymMap
): string {
  const c = asRecord(config);

  if (typeof c.stem === "string") return c.stem;

  if (Array.isArray(c.blanks)) {
    // 显式空位且未给题干模板：用占位串兜底
    return "____";
  }

  const itemSep = typeof c.itemSeparator === "string" ? c.itemSeparator : "、";
  const items = kp.canonicalAnswer
    .split(itemSep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const rawIdx = typeof c.blankIndex === "number" ? c.blankIndex : sequence;
  const idx = ((rawIdx % items.length) + items.length) % items.length;
  void synonyms;
  return items.map((it, i) => (i === idx ? "____" : it)).join(itemSep);
}
