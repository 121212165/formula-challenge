// 种子数据校验脚本(Phase 数据扩充)
// 检查 seed-herbs-db.ts / seed-acupoints-db.ts 的静态数据质量:
//   1) id/code 唯一性(Prisma @id 约束)
//   2) 必填字段完整率(FR-2.1 ≥95% / FR-3.1 ≥90%)
//   3) 分类/经络覆盖
//   4) 分类与经络名称必须存在于 CATEGORIES / MERIDIANS 表定义
// 用法: npx tsx scripts/verify-seeds.ts
import { readFileSync } from "fs";
import { join } from "path";

let exitCode = 0;
const errors: string[] = [];

function check(ok: boolean, msg: string) {
  if (!ok) {
    errors.push(msg);
    exitCode = 1;
  }
}

// ---- 中药 ----
const herbsSrc = readFileSync(join(process.cwd(), "scripts", "seed-herbs-db.ts"), "utf-8");
const herbEntries = [...herbsSrc.matchAll(/\{\s*id: "h_[a-z0-9_]+",\s*name: "[^"]+",\s*category: "[^"]+",\s*property: "[^"]*",\s*meridian: "[^"]*",\s*functions: "[^"]*",\s*indications: "[^"]*",\s*level: "[^"]*"/g)].map((m) => m[0]);
const herbIds = [...herbsSrc.matchAll(/id: "h_[a-z0-9_]+"/g)].map((m) => m[0].slice(4, -1));
const herbCats = [...herbsSrc.matchAll(/category: "([^"]+)"/g)].map((m) => m[1]);
const requiredHerbFields = ["property", "meridian", "functions", "indications", "level"];

console.log(`\n=== 中药种子校验 ===`);
console.log(`条目数: ${herbIds.length}`);
check(herbIds.length >= 100, `中药种子 < 100 味(当前 ${herbIds.length})`);

// id 唯一
const dupIds = herbIds.filter((v, i) => herbIds.indexOf(v) !== i);
check(dupIds.length === 0, `中药 id 重复: ${[...new Set(dupIds)].join(",")}`);

// 必填字段完整率
const missing: Record<string, string[]> = {};
for (const entry of herbEntries) {
  const id = entry.match(/id: "([^"]+)"/)![1];
  for (const f of requiredHerbFields) {
    const val = entry.match(new RegExp(`${f}: "([^"]*)"`))?.[1] ?? "";
    if (!val.trim()) (missing[id] ??= []).push(f);
  }
}
const totalFields = herbEntries.length * requiredHerbFields.length;
const missingCount = Object.values(missing).flat().length;
const herbRate = (1 - missingCount / totalFields) * 100;
console.log(`字段完整率: ${herbRate.toFixed(1)}%(缺失 ${missingCount}/${totalFields})`);
check(herbRate >= 95, `中药字段完整率 ${herbRate.toFixed(1)}% < 95%`);
const missingSample = Object.entries(missing).slice(0, 5);
if (missingSample.length) console.log("缺失示例:", JSON.stringify(missingSample));

// 分类覆盖
const definedCats = [...herbsSrc.matchAll(/name: "([^"]+)", sortOrder: \d+/g)].map((m) => m[1]);
const actualCats = [...new Set(herbCats)];
console.log(`分类覆盖: ${actualCats.length} 个(定义 ${definedCats.length} 个)`);
check(actualCats.length === definedCats.length, `分类不全: 实际 ${actualCats.length}/${definedCats.length}`);
const catCount: Record<string, number> = {};
for (const c of herbCats) catCount[c] = (catCount[c] ?? 0) + 1;
const thinCats = Object.entries(catCount).filter(([, n]) => n < 3);
if (thinCats.length) console.log("过薄分类(<3味):", thinCats.map(([c, n]) => `${c}(${n})`).join(" "));

// ---- 腧穴 ----
const aptSrc = readFileSync(join(process.cwd(), "scripts", "seed-acupoints-db.ts"), "utf-8");
const aptIds = [...aptSrc.matchAll(/id: "a_[a-z0-9_]+"/g)].map((m) => m[0].slice(4, -1));
const aptCodes = [...aptSrc.matchAll(/code: "([A-Z]{1,2}[0-9]+)"/g)].map((m) => m[1]);
const aptMers = [...aptSrc.matchAll(/meridian: "([^"]+)"/g)].map((m) => m[1]);
const requiredAptFields = ["location", "indications", "method", "mnemonic"];
const aptEntries = [...aptSrc.matchAll(/\{\s*id: "a_[a-z0-9_]+",[\s\S]*?mnemonicExplanation: "[^"]*",\s*level: "[^"]*"/g)].map((m) => m[0]);

console.log(`\n=== 腧穴种子校验 ===`);
console.log(`条目数: ${aptIds.length}`);
check(aptIds.length >= 50, `腧穴种子 < 50 穴(当前 ${aptIds.length})`);

const dupAptIds = aptIds.filter((v, i) => aptIds.indexOf(v) !== i);
check(dupAptIds.length === 0, `腧穴 id 重复: ${[...new Set(dupAptIds)].join(",")}`);
const dupCodes = aptCodes.filter((v, i) => aptCodes.indexOf(v) !== i);
check(dupCodes.length === 0, `腧穴 code 重复: ${[...new Set(dupCodes)].join(",")}`);

const aptMissing: Record<string, string[]> = {};
for (const entry of aptEntries) {
  const id = entry.match(/id: "([^"]+)"/)![1];
  for (const f of requiredAptFields) {
    const val = entry.match(new RegExp(`${f}: "([^"]*)"`))?.[1] ?? "";
    if (!val.trim()) (aptMissing[id] ??= []).push(f);
  }
}
const aptTotalFields = aptEntries.length * requiredAptFields.length;
const aptMissingCount = Object.values(aptMissing).flat().length;
const aptRate = (1 - aptMissingCount / aptTotalFields) * 100;
console.log(`字段完整率: ${aptRate.toFixed(1)}%(缺失 ${aptMissingCount}/${aptTotalFields})`);
check(aptRate >= 90, `腧穴字段完整率 ${aptRate.toFixed(1)}% < 90%`);

const definedMers = [...aptSrc.matchAll(/name: "([^"]+)", code: "[A-Z]{1,2}", sortOrder: \d+/g)].map((m) => m[1]);
const actualMers = [...new Set(aptMers)];
console.log(`经络覆盖: ${actualMers.length} 条(定义 ${definedMers.length} 条)`);
check(actualMers.length === definedMers.length, `经络不全: 实际 ${actualMers.length}/${definedMers.length}`);

// ---- 汇总 ----
console.log(`\n${exitCode === 0 ? "✅ 校验全部通过" : "❌ 校验失败:"}`);
if (exitCode) errors.forEach((e) => console.log("  - " + e));
process.exit(exitCode);
