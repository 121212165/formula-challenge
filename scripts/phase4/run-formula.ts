/**
 * Phase 4 · 方剂（formula）科目导入器
 *
 * 合并两份 raw 源表：
 *   data/raw/formula_full.json     （V1_方剂完整，190 行，含 助记/传统方歌/数据来源）
 *   data/raw/formula_pending.json  （V1_方剂待补全，70 行，列名为「方歌」，无 助记/数据来源）
 *
 * 合并顺序：full 在前、pending 在后。同名重复时先到者胜出，后者由共享管线
 * 规则 ⑦ DUPLICATE 自动标 skip，不在这里手写去重逻辑。
 *
 * 本文件只做：读 raw → 实现 normalize(raw, seq) → 调用 runPipeline。
 * 不自己写 ID/slug、不自己跑八项检查、不自己写报告（全部交给 lib）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, slugify } from "./lib";
import type {
  KnowledgePointDraft,
  NormalizedContentItem,
  RawRecord,
} from "./lib";

/** 项目根（本文件位于 scripts/phase4/，向上两级即根）。 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** 两份 raw 文件相对路径（与 sourceFiles 入参保持一致）。 */
const FULL_REL = "data/raw/formula_full.json";
const PENDING_REL = "data/raw/formula_pending.json";

/** 按源 sheet 名回推出落盘用的相对源文件路径（RawRecord 不含 sourceFile 列）。 */
function sourceFileOfSheet(sheet: string): string {
  if (sheet === "V1_方剂完整") return FULL_REL;
  if (sheet === "V1_方剂待补全") return PENDING_REL;
  // 兜底：不认识的 sheet 也给个可定位的占位，避免 provenance 丢字段。
  return `data/raw/${sheet}.json`;
}

/** 把源值规范化为「去空白字符串」或 null（null 表示源表为空）。 */
function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/** 读取并解析一份 raw 落盘文件，返回其 records 数组。 */
function loadRecords(rel: string): RawRecord[] {
  const abs = path.join(ROOT, rel);
  const envelope = JSON.parse(readFileSync(abs, "utf-8")) as {
    records: RawRecord[];
  };
  return envelope.records;
}

/**
 * 方剂科目 normalize：把一条 RawRecord 转成 NormalizedContentItem。
 * @param raw 源记录（fields 为中文字段名 → 源值）
 * @param seq 合并后从 1 开始的行序（用于生成 slug）
 */
const normalize = (raw: RawRecord, seq: number): NormalizedContentItem => {
  const f = raw.fields as Record<string, unknown>;

  // —— 顶层字段 ——
  const name = text(f["名称"]) ?? "";
  const category = text(f["章节名"]);
  const level = text(f["等级"]);
  // 方剂无原 ID 列，externalId 固定 null；full 行有「数据来源」(formulas_enriched.json)，原样回传，pending 行无此列 → null。
  const sourceRef = text(f["数据来源"]);

  // —— sourceFields：本 item 用到的中文键原值（null 表示源表空）。
  // 注意：pending 表列名是「方歌」而非「传统方歌」，按实际源键放入。
  const sourceFields: Record<string, string | null> = {
    "组成": text(f["组成"]),
    "功效": text(f["功效"]),
    "主治": text(f["主治"]),
    "助记": text(f["助记"]), // pending 表无此列 → null（会触发规则⑥，落 review）
    "传统方歌": text(f["传统方歌"]), // pending 表无此列 → null
    "传统方歌解释": text(f["传统方歌解释"]),
    "方歌": text(f["方歌"]), // pending 表的方歌列源键名
  };

  // —— 方歌助记 KP 的标准答案取值优先级 ——
  // 助记 非空则用它；否则 传统方歌；否则 方歌（pending 表用「方歌」列）；都空则空串。
  const mnemonicAnswer =
    text(f["助记"]) ?? text(f["传统方歌"]) ?? text(f["方歌"]) ?? "";
  // 解释：助记解释 非空用它，否则 传统方歌解释（谁非空用谁）。
  const mnemonicExplanation =
    text(f["助记解释"]) ?? text(f["传统方歌解释"]);

  // —— 四个 KP 草稿，sortOrder 1..4 ——
  const knowledgePoints: KnowledgePointDraft[] = [
    {
      type: "formula.ingredients",
      title: `${name}·组成`,
      canonicalAnswer: text(f["组成"]) ?? "",
      explanation: null,
      sortOrder: 1,
    },
    {
      type: "formula.functions",
      title: `${name}·功效`,
      canonicalAnswer: text(f["功效"]) ?? "",
      explanation: null,
      sortOrder: 2,
    },
    {
      type: "formula.indications",
      title: `${name}·主治`,
      canonicalAnswer: text(f["主治"]) ?? "",
      explanation: null,
      sortOrder: 3,
    },
    {
      type: "formula.mnemonic",
      title: `${name}·方歌助记`,
      canonicalAnswer: mnemonicAnswer,
      explanation: mnemonicExplanation,
      sortOrder: 4,
    },
  ];

  return {
    subject: "formula",
    slug: slugify("formula", seq),
    name,
    externalId: null,
    category,
    level,
    sourceRef,
    provenance: {
      sourceFile: sourceFileOfSheet(raw.sourceSheet),
      sourceSheet: raw.sourceSheet,
      sourceRow: raw.sourceRow,
    },
    sourceFields,
    knowledgePoints,
  };
};

/** 主流程：合并 records（full 在前、pending 在后）→ 跑管线 → 落四层产物。 */
function main(): void {
  const fullRecords = loadRecords(FULL_REL);
  const pendingRecords = loadRecords(PENDING_REL);
  // full 在前：同名重复时 full 胜出，pending 后到者由规则⑦标 skip。
  const rawRecords = [...fullRecords, ...pendingRecords];

  const result = runPipeline({
    subject: "formula",
    rawRecords,
    sourceFiles: [FULL_REL, PENDING_REL],
    normalize,
  });

  // 控制台打印落盘结果与计数，便于人工核对。
  console.log("[run-formula] normalized  ->", result.normalizedFile);
  console.log("[run-formula] validated   ->", result.validatedFile);
  console.log("[run-formula] published   ->", result.publishedFile);
  console.log("[run-formula] report      ->", result.reportFile);
  console.log("[run-formula] counts      ->", result.counts);
}

main();
