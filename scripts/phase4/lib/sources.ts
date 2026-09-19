/**
 * Phase 4 管线 · ContentSource 种子登记
 *
 * 三个来源种子的 id 在本文件写死，跨 run 稳定，全管线复用：
 *   ① 《方剂学》教材 —— 权威出版物（教材原文参照表、教材直接引用）
 *   ② 岐黄数据库   —— 在线 TCM 知识库（Excel "数据来源"列指向的富化/种子文件）
 *   ③ 内部整理数据 —— V1→V2 人工整理补全，未经外部出版物核验（默认兜底）
 *
 * 来源归属口径（审计假设，PIPELINE-SPEC.md 同步记录，导入子代理不得自行改写）：
 *   - Excel M 列 / 中药 K 列写了 formulas_enriched.json / seed-herbs-db.ts
 *     等文件名 → 映射到 ② 岐黄数据库；
 *   - 该列为空 / 无法识别（待补全表、腧穴表、教材原文表均无此列）→ ③ 内部整理数据。
 */
import type { ContentSourceSeed } from "./types";

/** ① 教材 */
export const SOURCE_TEXTBOOK: ContentSourceSeed = {
  id: "cb46d25840001c9afdfb44fbb",
  title: "《方剂学》教材",
  edition: "全国中医药行业高等教育教材",
  publisher: null,
  year: null,
  citation: "全国中医药行业高等教育教材《方剂学》",
};

/** ② 岐黄数据库 */
export const SOURCE_QIHUANG: ContentSourceSeed = {
  id: "cb46d25840002f02127598548",
  title: "岐黄数据库",
  edition: null,
  publisher: "岐黄之术在线数据库",
  year: null,
  citation: "岐黄数据库 qihuang.cc 在线检索",
};

/** ③ 内部整理数据 */
export const SOURCE_INTERNAL: ContentSourceSeed = {
  id: "cb46d25840003c4c43b6a1dd5",
  title: "内部整理数据",
  edition: null,
  publisher: null,
  year: null,
  citation: "V1→V2 人工整理补全数据，未经外部出版物核验",
};

/** 全部已登记种子（质检规则 ③ 据此判断来源是否登记）。 */
export const ALL_SOURCES: readonly ContentSourceSeed[] = [
  SOURCE_TEXTBOOK,
  SOURCE_QIHUANG,
  SOURCE_INTERNAL,
];

/**
 * Excel "数据来源"列原值 → 种子 id 的映射表。
 * 未列入表中的值一律按兜底处理（见 mapSourceRef）。
 */
const FILE_NAME_TO_SOURCE_ID: Record<string, string> = {
  "formulas_enriched.json": SOURCE_QIHUANG.id,
  "seed-herbs-db.ts": SOURCE_QIHUANG.id,
};

/**
 * 按源表"数据来源"列原值解析出归属种子。
 * - 空 / null / undefined → ③ 内部整理数据；
 * - 命中映射表 → 对应种子；
 * - 未识别 → 兜底 ③ 内部整理数据（并视为已登记，不报错）。
 */
export function mapSourceRef(ref: string | null | undefined): ContentSourceSeed {
  const key = (ref ?? "").trim();
  if (!key) return SOURCE_INTERNAL;
  const mapped = FILE_NAME_TO_SOURCE_ID[key];
  if (mapped) {
    const hit = ALL_SOURCES.find((s) => s.id === mapped);
    if (hit) return hit;
  }
  return SOURCE_INTERNAL;
}

/** 判断给定 sourceId 是否命中已登记种子。 */
export function isRegisteredSourceId(id: string | null | undefined): boolean {
  if (!id) return false;
  return ALL_SOURCES.some((s) => s.id === id);
}
