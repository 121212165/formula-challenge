/**
 * Phase 4 · 中药科目导入器（herb）
 *
 * 源：data/raw/herbs.json（V1_中药，306 味）
 * 产物（由 runPipeline 落盘）：
 *   data/normalized/herb.json
 *   data/validated/herb.json
 *   data/published/herb.json
 *   data/reports/herb-report.json
 *
 * 设计要点（与 PIPELINE-SPEC §5/§6 对齐）：
 *   - 每味药建 6 个 KP 草稿（sortOrder 1..6）：
 *       property / meridian / functions / indications / usage / contraindications
 *   - Excel 中药表没有「用法用量」「使用注意」两列：
 *       · sourceFields 里这两个键硬编码为 null；
 *       · 对应 KP 的 canonicalAnswer 给空串、explanation 写补录提示；
 *       · 于是 ② ANSWER_NONEMPTY 与 ⑥ FIELD_INCOMPLETE 必然命中 → review，
 *         绝不发布、绝不编造内容填充。
 *   - 本文件不写 ID/slug、不跑八项检查、不写报告——全部交给 lib/runPipeline。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runPipeline, slugify } from "./lib";
import type {
  KnowledgePointDraft,
  NormalizedContentItem,
  RawRecord,
} from "./lib";

/** 项目根（本文件在 scripts/phase4/，上两级即根）。 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * 源单元格规范化：null/undefined/空串/纯空白 → null；否则 trim 后字符串。
 * 用于 sourceFields 与 item 级字段（category/level/externalId/sourceRef）。
 */
function cell(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * KP 答案文本：KnowledgePointDraft.canonicalAnswer 必须是 string。
 * 源值为空时返回空串（空答案会被规则 ② 判为 error → review，符合预期）。
 */
function answer(v: unknown): string {
  return cell(v) ?? "";
}

/**
 * 把一条 V1_中药 rawRecord 归一化为 NormalizedContentItem。
 * @param raw 原始记录（fields 为中文字段名 → 源值）
 * @param seq 行序（从 1 开始，用于 slugify）
 */
function normalize(raw: RawRecord, seq: number): NormalizedContentItem {
  const f = raw.fields as Record<string, unknown>;
  const name = answer(f["名称"]);

  // 本 item 用到的源字段快照。用法用量/使用注意 在 Excel 中无对应列，
  // 这里硬编码 null，保证规则 ⑥ 必然命中、不编造内容。
  const sourceFields: Record<string, string | null> = {
    "性味": cell(f["性味"]),
    "归经": cell(f["归经"]),
    "功效": cell(f["功效"]),
    "主治": cell(f["主治"]),
    "用法用量": null,
    "使用注意": null,
  };

  const knowledgePoints: KnowledgePointDraft[] = [
    {
      type: "herb.property",
      title: `${name}·性味`,
      canonicalAnswer: answer(f["性味"]),
      explanation: null,
      sortOrder: 1,
    },
    {
      type: "herb.meridian",
      title: `${name}·归经`,
      canonicalAnswer: answer(f["归经"]),
      explanation: null,
      sortOrder: 2,
    },
    {
      type: "herb.functions",
      title: `${name}·功效`,
      canonicalAnswer: answer(f["功效"]),
      explanation: null,
      sortOrder: 3,
    },
    {
      type: "herb.indications",
      title: `${name}·主治`,
      canonicalAnswer: answer(f["主治"]),
      explanation: null,
      sortOrder: 4,
    },
    {
      // 无源列：答案空串，仅占位待人工补录，绝不发布。
      type: "herb.usage",
      title: `${name}·用法用量`,
      canonicalAnswer: "",
      explanation: "Excel 无源数据列，待补录用法用量",
      sortOrder: 5,
    },
    {
      // 无源列：答案空串，仅占位待人工补录，绝不发布。
      type: "herb.contraindications",
      title: `${name}·使用注意`,
      canonicalAnswer: "",
      explanation: "Excel 无源数据列，待补录使用注意/禁忌",
      sortOrder: 6,
    },
  ];

  return {
    subject: "herb",
    slug: slugify("herb", seq),
    name,
    externalId: cell(f["ID"]),
    category: cell(f["分类"]),
    level: cell(f["等级"]),
    sourceRef: cell(f["数据来源"]),
    provenance: {
      sourceFile: "data/raw/herbs.json",
      sourceSheet: raw.sourceSheet,
      sourceRow: raw.sourceRow,
    },
    sourceFields,
    knowledgePoints,
  };
}

/** 入口：读 raw → 跑管线 → 打印四层产物路径与计数。 */
function main(): void {
  const rawPath = path.join(ROOT, "data", "raw", "herbs.json");
  const parsed = JSON.parse(readFileSync(rawPath, "utf-8")) as {
    records: RawRecord[];
  };

  const result = runPipeline({
    subject: "herb",
    rawRecords: parsed.records,
    sourceFiles: ["data/raw/herbs.json"],
    normalize,
  });

  console.log("=== 中药科目导入完成（herb）===");
  console.log("counts:", JSON.stringify(result.counts));
  console.log("normalized :", result.normalizedFile);
  console.log("validated  :", result.validatedFile);
  console.log("published  :", result.publishedFile);
  console.log("report     :", result.reportFile);
}

main();
