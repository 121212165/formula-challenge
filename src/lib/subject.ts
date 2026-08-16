// 多科目(subject)核心类型与校验
// 2026-08 多科目扩展:formula(方剂) | herb(中药) | acupoint(腧穴)
// id 前缀规范:c_ = 方剂(存量兼容) / h_ = 中药 / a_ = 腧穴

export const SUBJECTS = ["formula", "herb", "acupoint"] as const;
export type Subject = (typeof SUBJECTS)[number];

const ID_PREFIX: Record<Subject, string> = {
  formula: "c_",
  herb: "h_",
  acupoint: "a_",
};

/** 方剂存量 id 形如 c01_麻黄汤(数字编号),兼容 c_ 前缀 */
const FORMULA_ID_RE = /^c\d+_/;

/** 校验条目 id 是否符合所属科目的前缀规范 */
export function validItemId(subject: Subject, id: string): boolean {
  if (subject === "formula") return FORMULA_ID_RE.test(id) || id.startsWith("c_");
  const prefix = ID_PREFIX[subject];
  if (!prefix) return false;
  return id.startsWith(prefix);
}

// ==================== 中药条目 ====================

export interface HerbEntry {
  id: string;
  name: string;
  category: string;
  property: string; // 性味
  meridian: string; // 归经
  functions: string; // 功效
  indications: string; // 主治
  level: string;
}

const HERB_REQUIRED: (keyof HerbEntry)[] = [
  "id",
  "name",
  "category",
  "property",
  "meridian",
  "functions",
  "indications",
];

/** 校验单条中药数据:字段完整率 + id 前缀;返回缺失字段清单 */
export function validateHerbEntry(entry: HerbEntry): {
  valid: boolean;
  missing: (keyof HerbEntry)[];
} {
  const missing = HERB_REQUIRED.filter(
    (k) => !entry[k] || (typeof entry[k] === "string" && (entry[k] as string).trim() === "")
  );
  if (!validItemId("herb", entry.id)) {
    if (!missing.includes("id")) missing.push("id" as keyof HerbEntry);
  }
  return { valid: missing.length === 0, missing };
}

/** 批量校验中药数据,返回完整率统计 */
export function validateHerbSet(entries: HerbEntry[]): {
  total: number;
  valid: number;
  invalid: number;
  invalidIds: string[];
} {
  const invalidIds: string[] = [];
  let valid = 0;
  for (const e of entries) {
    if (validateHerbEntry(e).valid) valid++;
    else invalidIds.push(e.id);
  }
  return { total: entries.length, valid, invalid: entries.length - valid, invalidIds };
}

// ==================== 腧穴条目 ====================

export interface AcupointEntry {
  id: string;
  name: string;
  code: string; // 国际代码,如 LI4
  meridian: string;
  location: string; // 定位
  indications: string; // 主治
  method: string; // 刺灸法
  level: string;
}

const ACUPOINT_REQUIRED: (keyof AcupointEntry)[] = [
  "id",
  "name",
  "code",
  "meridian",
  "location",
  "indications",
];

/** 校验单条腧穴数据(定位/主治/国际代码为硬性字段) */
export function validateAcupointEntry(entry: AcupointEntry): {
  valid: boolean;
  missing: (keyof AcupointEntry)[];
} {
  const missing = ACUPOINT_REQUIRED.filter(
    (k) => !entry[k] || (typeof entry[k] === "string" && (entry[k] as string).trim() === "")
  );
  if (!validItemId("acupoint", entry.id)) {
    if (!missing.includes("id")) missing.push("id" as keyof AcupointEntry);
  }
  return { valid: missing.length === 0, missing };
}

/** 批量校验腧穴数据 */
export function validateAcupointSet(entries: AcupointEntry[]): {
  total: number;
  valid: number;
  invalid: number;
  invalidIds: string[];
} {
  const invalidIds: string[] = [];
  let valid = 0;
  for (const e of entries) {
    if (validateAcupointEntry(e).valid) valid++;
    else invalidIds.push(e.id);
  }
  return { total: entries.length, valid, invalid: entries.length - valid, invalidIds };
}
