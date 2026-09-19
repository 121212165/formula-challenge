/**
 * build-sqlite-schema.cjs —— 从 canonical prisma/schema.prisma 派生 SQLite 测试 schema。
 *
 * 规则：模型原样保留，只做两件事：
 *   1. datasource 块：provider postgresql -> sqlite；url 改为 file:./test.db；移除 directUrl（SQLite 无直连概念）。
 *   2. generator 块：若未指定 output，则追加独立输出目录，避免覆盖生产 postgres client。
 *
 * 产物：prisma/schema.test.prisma（本地真实库集成测试专用，CI/本地均可，无需 Postgres）。
 *
 * 用法：node scripts/build-sqlite-schema.cjs
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const srcPath = path.join(root, "prisma", "schema.prisma");
const outPath = path.join(root, "prisma", "schema.test.prisma");

const src = fs.readFileSync(srcPath, "utf8");

// 1) 替换 datasource 块（非贪婪匹配到第一个闭合花括号）
const datasourceRe = /datasource\s+db\s*\{[\s\S]*?\}/;
if (!datasourceRe.test(src)) {
  throw new Error("未在 schema.prisma 中找到 datasource db 块");
}
let out = src.replace(
  datasourceRe,
  'datasource db {\n  provider = "sqlite"\n  url      = "file:./test.db"\n}'
);

// 2) generator 块：追加独立 output（不覆盖生产 client）
const generatorRe = /generator\s+client\s*\{[\s\S]*?\}/;
out = out.replace(generatorRe, (block) => {
  if (/output\s*=/.test(block)) return block; // 已指定，不动
  return block.replace(
    "{",
    '{\n  output   = "../src/tests/integration/.sqlite-client"'
  );
});

fs.writeFileSync(outPath, out, "utf8");
console.log(`[build-sqlite-schema] 已生成 ${path.relative(root, outPath)}`);
