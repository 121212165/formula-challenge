/**
 * Phase 4 · 腧穴（acupoint）科目导入器
 *
 * 源：data/raw/acupoints.json（V1_腧穴，259 穴）。
 * 职责：
 *   1. 把每条 raw 记录 normalize 成 NormalizedContentItem（5 个 KP 草稿）；
 *   2. 调用共享 runPipeline 跑「八项检查 + 状态策略」，落盘
 *      normalized / validated / published / reports 四层；
 *   3. 跑完后从 normalized 层去重提取全部经络（category），
 *      生成 data/normalized/meridians.json（供后续 db:seed 建经络维表）。
 *
 * 注意：
 *   - 腧穴表无「数据来源」列 → sourceRef 显式传 null，
 *     由 runPipeline 内部 mapSourceRef(null) 兜底到「内部整理数据」种子（已登记），
 *     规则 ③ SOURCE_REGISTERED 不应报错。
 *   - 「注意事项」不是 KP 类型，只进 sourceFields，后续 db:seed 映射到
 *     AcupointContent.caution，不为它建 KP。
 *   - 不直连数据库、不改 schema。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, slugify } from "./lib";
import type { NormalizedContentItem, RawRecord } from "./lib";
import type { KnowledgePointType } from "@/shared/types/knowledge-point-type";

/** 项目根（本文件位于 scripts/phase4/，上两级即根）。 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const RAW_FILE = "data/raw/acupoints.json";
const NORMALIZED_FILE = path.join(ROOT, "data", "normalized", "acupoint.json");
const MERIDIANS_FILE = path.join(ROOT, "data", "normalized", "meridians.json");

/** 源表字段名 → 文本；空单元格统一为 null（保留 null 语义，供规则 ⑥ 判定）。 */
function textOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length === 0 ? null : s;
}

/** KP 标准答案：源为空时给空串（类型要求 string），由规则 ②/⑥ 判 review。 */
function answerOrEmpty(v: unknown): string {
  return textOrNull(v) ?? "";
}

/** 把一条 raw 腧穴记录转成 NormalizedContentItem（含 5 个 KP 草稿）。 */
function normalize(raw: RawRecord, seq: number): NormalizedContentItem {
  const f = raw.fields;

  const name = textOrNull(f["名称"]) ?? "";
  const category = textOrNull(f["经络"]);
  const level = textOrNull(f["等级"]);
  const externalId = textOrNull(f["ID"]);

  // 用到的源字段原值快照（含「注意事项」，仅留存不建 KP）。
  const sourceFields: Record<string, string | null> = {
    经络: category,
    定位: textOrNull(f["定位"]),
    主治: textOrNull(f["主治"]),
    刺法: textOrNull(f["刺法"]),
    特殊: textOrNull(f["特殊"]),
    助记: textOrNull(f["助记"]),
    注意事项: textOrNull(f["注意事项"]),
    拼音: textOrNull(f["拼音"]),
    编码: textOrNull(f["编码"]),
  };

  // 五个 KP 草稿，sortOrder 固定 1..5。
  const knowledgePoints: Array<{
    type: KnowledgePointType;
    title: string;
    canonicalAnswer: string;
    explanation: string | null;
    sortOrder: number;
  }> = [
    {
      type: "acupoint.location",
      title: `${name}·定位`,
      canonicalAnswer: answerOrEmpty(f["定位"]),
      explanation: null,
      sortOrder: 1,
    },
    {
      type: "acupoint.indications",
      title: `${name}·主治`,
      canonicalAnswer: answerOrEmpty(f["主治"]),
      explanation: null,
      sortOrder: 2,
    },
    {
      type: "acupoint.method",
      title: `${name}·刺法操作`,
      canonicalAnswer: answerOrEmpty(f["刺法"]),
      explanation: null,
      sortOrder: 3,
    },
    {
      type: "acupoint.special",
      title: `${name}·特定穴属性`,
      canonicalAnswer: answerOrEmpty(f["特殊"]),
      explanation: null,
      sortOrder: 4,
    },
    {
      type: "acupoint.mnemonic",
      title: `${name}·助记`,
      canonicalAnswer: answerOrEmpty(f["助记"]),
      explanation: textOrNull(f["助记解释"]),
      sortOrder: 5,
    },
  ];

  return {
    subject: "acupoint",
    slug: slugify("acupoint", seq),
    name,
    externalId,
    category,
    level,
    // 腧穴表无「数据来源」列 → 显式 null，交 runPipeline 内部 mapSourceRef 兜底到内部整理数据。
    sourceRef: null,
    provenance: {
      sourceFile: RAW_FILE,
      sourceSheet: raw.sourceSheet,
      sourceRow: raw.sourceRow,
    },
    sourceFields,
    knowledgePoints,
  };
}

/**
 * 经络名 → 标准编码。规则按任务给定；把更具体的长词放前面，
 * 避免「心包」被「心」抢先命中（PC 不能误判成 HT）。
 */
const MERIDIAN_RULES: ReadonlyArray<readonly [pattern: string, code: string]> = [
  ["心包", "PC"],
  ["大肠", "LI"],
  ["小肠", "SI"],
  ["膀胱", "BL"],
  ["三焦", "TE"],
  ["肺经", "LU"],
  ["胃", "ST"],
  ["脾", "SP"],
  ["心", "HT"],
  ["肾", "KI"],
  ["胆", "GB"],
  ["肝", "LR"],
  ["任脉", "CV"],
  ["督脉", "GV"],
];

/** 解析经络编码；匹配不到回退 MERIDIAN_<序号>（序号在调用处用 sortOrder 填）。 */
function codeOfMeridian(name: string, fallbackSeq: number): string {
  for (const [pattern, code] of MERIDIAN_RULES) {
    if (name.includes(pattern)) return code;
  }
  return `MERIDIAN_${fallbackSeq}`;
}

/** 从 normalized 层去重提取经络，按首次出现顺序写 meridians.json。 */
function writeMeridians(): number {
  const normalized = JSON.parse(
    readFileSync(NORMALIZED_FILE, "utf-8"),
  ) as { items: Array<{ category: string | null }> };

  const seen: string[] = [];
  for (const item of normalized.items) {
    const m = item.category?.trim();
    if (m && !seen.includes(m)) seen.push(m);
  }

  const items = seen.map((name, idx) => ({
    name,
    code: codeOfMeridian(name, idx + 1),
    sortOrder: idx + 1,
  }));

  mkdirSync(path.dirname(MERIDIANS_FILE), { recursive: true });
  writeFileSync(
    MERIDIANS_FILE,
    JSON.stringify({ count: items.length, items }, null, 2),
    "utf-8",
  );
  return items.length;
}

function main(): void {
  const rawPath = path.join(ROOT, RAW_FILE);
  const parsed = JSON.parse(readFileSync(rawPath, "utf-8")) as {
    records: RawRecord[];
  };

  const result = runPipeline({
    subject: "acupoint",
    rawRecords: parsed.records,
    sourceFiles: [RAW_FILE],
    normalize,
  });

  const meridiansCount = writeMeridians();

  console.log("[acupoint] 管线完成：");
  console.log("  items      :", result.counts.itemsNormalized, "/ 发布", result.counts.itemsPublished, "/ 复核", result.counts.itemsReview, "/ 跳过", result.counts.itemsSkipped);
  console.log("  kps        :", "总", result.counts.kpsTotal, "发布", result.counts.kpsPublished, "复核", result.counts.kpsReview);
  console.log("  meridians  :", meridiansCount);
  console.log("  files:");
  console.log("   -", result.normalizedFile);
  console.log("   -", result.validatedFile);
  console.log("   -", result.publishedFile);
  console.log("   -", result.reportFile);
  console.log("   - data/normalized/meridians.json");
}

main();
