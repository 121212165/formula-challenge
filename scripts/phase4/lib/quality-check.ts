/**
 * Phase 4 管线 · 八项质量检查（纯函数，无 IO）
 *
 * 规则清单（ruleId 固定，质量报告按 ruleId 聚合计数）：
 *   ① NAME_NONEMPTY       名称非空（item 级，error）
 *   ② ANSWER_NONEMPTY     canonicalAnswer 非空且长度 ≥ 2（kp 级，error）
 *   ③ SOURCE_REGISTERED   sourceId 命中已登记 ContentSource 种子（item 级，error）
 *   ④ ANSWER_NO_PLACEHOLDER canonicalAnswer 不含占位符/NaN/TODO/待补 等（kp 级，error）
 *   ⑤ TYPE_KNOWN         type 在 KnowledgePointType 枚举内（kp 级，error）
 *   ⑥ FIELD_INCOMPLETE   必需源字段组任一非空即通过，全空 → error（转 review）
 *   ⑦ DUPLICATE          同 subject 同 name 已出现过（item 级，error → skip）
 *   ⑧ FORMAT_CLEAN       不含连续空白/乱码/截断标记（kp 级，warning）
 */
import type { KnowledgePointType } from "@/shared/types/knowledge-point-type";
import type {
  KnowledgePointDraft,
  NormalizedContentItem,
  QualityIssue,
} from "./types";
import { isRegisteredSourceId } from "./sources";

export const RULE = {
  NAME_NONEMPTY: "NAME_NONEMPTY",
  ANSWER_NONEMPTY: "ANSWER_NONEMPTY",
  SOURCE_REGISTERED: "SOURCE_REGISTERED",
  ANSWER_NO_PLACEHOLDER: "ANSWER_NO_PLACEHOLDER",
  TYPE_KNOWN: "TYPE_KNOWN",
  FIELD_INCOMPLETE: "FIELD_INCOMPLETE",
  DUPLICATE: "DUPLICATE",
  FORMAT_CLEAN: "FORMAT_CLEAN",
} as const;

/** 合法 KP 类型全集。 */
const KNOWN_TYPES: ReadonlySet<KnowledgePointType> = new Set<KnowledgePointType>([
  "formula.ingredients",
  "formula.functions",
  "formula.indications",
  "formula.mnemonic",
  "herb.property",
  "herb.meridian",
  "herb.functions",
  "herb.indications",
  "herb.usage",
  "herb.contraindications",
  "acupoint.location",
  "acupoint.indications",
  "acupoint.method",
  "acupoint.special",
  "acupoint.mnemonic",
]);

/**
 * 每个 KP 类型必需的源表字段（中文字段名）。
 *
 * 语义（规则 ⑥）：数组内字段「任一非空即通过」，全部为空才报 FIELD_INCOMPLETE。
 * 绝大多数类型只有一个字段，等价于「该字段必须有值」；
 * 特例 formula.mnemonic：助记 / 传统方歌 / 方歌 三列任一非空即可——
 *   full 表用「助记」或「传统方歌」，pending 表没有这两列、方歌存在「方歌」列。
 *
 * 注意：herb.usage / herb.contraindications 在 Excel 源表中没有对应列，
 * 因此所有此类 KP 必然命中 ⑥ FIELD_INCOMPLETE → 状态策略判 review，
 * 等待人工补录，绝不直接发布。
 */
export const REQUIRED_SOURCE_FIELDS: Record<KnowledgePointType, string[]> = {
  "formula.ingredients": ["组成"],
  "formula.functions": ["功效"],
  "formula.indications": ["主治"],
  "formula.mnemonic": ["助记", "传统方歌", "方歌"],
  "herb.property": ["性味"],
  "herb.meridian": ["归经"],
  "herb.functions": ["功效"],
  "herb.indications": ["主治"],
  "herb.usage": ["用法用量"],
  "herb.contraindications": ["使用注意"],
  "acupoint.location": ["定位"],
  "acupoint.indications": ["主治"],
  "acupoint.method": ["刺法"],
  "acupoint.special": ["特殊"],
  "acupoint.mnemonic": ["助记"],
};

/** 占位符 / 坏答案特征（命中即 error）。 */
const PLACEHOLDER_RE =
  /TODO|XXX|N\/A|NaN|待定|待补|占位|placeholder|undefined|null/;

/** 连续空白 / 乱码 / 截断特征（命中即 warning）。 */
const WHITESPACE_RE = /[ \t　]{3,}/;
/** UTF-8 被误读成 Latin-1 后的典型乱码串（连续的重音字母）。 */
const MOJIBAKE_RE = /[\u00c0-\u024f\u0100-\u017f]{3,}/;
const TRUNCATION_RE = /…{2,}$|。{3,}$|,，$|，,$/;

/** 质检上下文。 */
export interface CheckContext {
  /** 已出现过的 item key：`${subject}|${name}`，用于规则 ⑦。 */
  seenItemKeys: Set<string>;
  /** 本 item 已解析出的 sourceId（规则 ③ 用）。 */
  sourceId: string;
  /** 本 item 的源字段快照（规则 ⑥ 用）。 */
  sourceFields: Record<string, string | null>;
}

function issue(
  ruleId: string,
  severity: "error" | "warning",
  message: string,
  field?: string,
): QualityIssue {
  return field ? { ruleId, severity, message, field } : { ruleId, severity, message };
}

/**
 * item 级检查：规则 ① 名称非空、③ 来源登记、⑦ 重复。
 * 重复检测通过后把当前 key 写入 seenItemKeys（同一 item 内只调一次）。
 */
export function checkContentItem(
  item: NormalizedContentItem,
  sourceId: string,
  ctx: Pick<CheckContext, "seenItemKeys">,
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // ① 名称非空
  if (!item.name || !item.name.trim()) {
    issues.push(issue(RULE.NAME_NONEMPTY, "error", "ContentItem 名称为空", "name"));
  }

  // ③ 来源登记
  if (!isRegisteredSourceId(sourceId)) {
    issues.push(
      issue(RULE.SOURCE_REGISTERED, "error", `sourceId 未登记：${sourceId}`, "sourceId"),
    );
  }

  // ⑦ 重复（先查后写，保证首个出现的不算重复）
  const key = `${item.subject}|${item.name.trim()}`;
  if (ctx.seenItemKeys.has(key)) {
    issues.push(issue(RULE.DUPLICATE, "error", `同科目同名条目重复：${key}`, "name"));
  } else {
    ctx.seenItemKeys.add(key);
  }

  return issues;
}

/**
 * kp 级检查：规则 ②④⑤⑥⑧。
 * @param kp 知识点草稿
 * @param ctx 含 sourceFields 的上下文
 */
export function checkKnowledgePoint(
  kp: KnowledgePointDraft,
  ctx: Pick<CheckContext, "sourceFields">,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const answer = kp.canonicalAnswer ?? "";

  // ② 答案非空且长度 ≥ 2
  if (!answer || answer.trim().length < 2) {
    issues.push(
      issue(RULE.ANSWER_NONEMPTY, "error", `canonicalAnswer 为空或过短（长度 ${answer.trim().length}）`, "canonicalAnswer"),
    );
  }

  // ④ 不含占位符 / NaN 等
  if (PLACEHOLDER_RE.test(answer)) {
    issues.push(
      issue(RULE.ANSWER_NO_PLACEHOLDER, "error", "canonicalAnswer 含占位符/NaN/TODO 等坏答案特征", "canonicalAnswer"),
    );
  }

  // ⑤ 类型在枚举内
  if (!KNOWN_TYPES.has(kp.type)) {
    issues.push(issue(RULE.TYPE_KNOWN, "error", `未知 KP 类型：${kp.type}`, "type"));
  }

  // ⑥ 必需源字段完整：数组内任一非空即通过，全部为空才报 error。
  const required = REQUIRED_SOURCE_FIELDS[kp.type];
  if (required && required.length > 0) {
    const present = required.filter(
      (field) => (ctx.sourceFields[field] ?? "").trim().length > 0,
    );
    if (present.length === 0) {
      issues.push(
        issue(
          RULE.FIELD_INCOMPLETE,
          "error",
          `KP 类型 ${kp.type} 必需源字段（任一非空）均缺失：${required.join(" / ")}`,
          required[0],
        ),
      );
    }
  }

  // ⑧ 格式（warning）
  if (WHITESPACE_RE.test(answer)) {
    issues.push(issue(RULE.FORMAT_CLEAN, "warning", "答案含连续空白（3+ 空格/制表符）", "canonicalAnswer"));
  }
  if (MOJIBAKE_RE.test(answer)) {
    issues.push(issue(RULE.FORMAT_CLEAN, "warning", "答案疑似含乱码（UTF-8 被误读）", "canonicalAnswer"));
  }
  if (TRUNCATION_RE.test(answer)) {
    issues.push(issue(RULE.FORMAT_CLEAN, "warning", "答案疑似被截断（省略号/尾逗号结尾）", "canonicalAnswer"));
  }

  return issues;
}
