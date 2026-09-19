/**
 * seed-dev.ts —— 本地 SQLite 开发库 seed 脚本（ESM，用 tsx 运行）。
 *
 * - 目标库：prisma/dev.db（由 schema.dev.prisma 的 datasource url 指向）。
 * - 客户端：由 `prisma generate --schema prisma/schema.dev.prisma` 生成，
 *   输出到 src/server/generated/prisma-dev（与生产 PG / 测试 SQLite 隔离）。
 * - 数据来源：data/published/{formula,acupoint,herb}.json
 *   结构为 Subject -> ContentItem -> KnowledgePoint 三层。
 * - 全部按主键 id 用 upsert 写入，幂等可重复执行。
 * - 题目(Question)不在 seed 范围：由后端 question registry 运行时生成。
 *
 * 运行：npm run db:dev:seed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
// eslint-disable-next-line import/no-unresolved
import { PrismaClient as DevPrismaClient } from "../src/server/generated/prisma-dev/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> 项目根
const root = path.resolve(here, "..");
const DB_URL =
  "file:" + path.join(root, "prisma", "dev.db").replace(/\\/g, "/");

const prisma = new DevPrismaClient({
  datasourceUrl: DB_URL,
}) as unknown as import("@prisma/client").PrismaClient;

interface RawKnowledgePoint {
  id: string;
  code: string;
  type: string;
  title: string;
  canonicalAnswer: string;
  explanation?: string | null;
  sortOrder: number;
  status: string;
}

interface RawContentItem {
  id: string;
  subject: string;
  slug: string;
  name: string;
  knowledgePoints?: RawKnowledgePoint[];
}

interface RawDataset {
  subject: string;
  count: number;
  items: RawContentItem[];
}

const SUBJECTS: Array<{
  code: string;
  name: string;
  description: string;
}> = [
  { code: "formula", name: "方剂", description: "经典方剂库：组成、功效、主治与配伍要点。" },
  { code: "herb", name: "中药", description: "中药库：性味归经、功效主治与用法用量。" },
  { code: "acupoint", name: "腧穴", description: "经络腧穴库：定位、刺灸法、主治与特定穴。" },
];

function loadDataset(file: string): RawDataset | null {
  const abs = path.join(root, "data", "published", file);
  const raw = readFileSync(abs, "utf-8");
  return JSON.parse(raw) as RawDataset;
}

async function main(): Promise<void> {
  // 1) 三个 Subject（id == code）
  for (const s of SUBJECTS) {
    await prisma.subject.upsert({
      where: { id: s.code },
      create: {
        id: s.code,
        code: s.code,
        name: s.name,
        description: s.description,
        enabled: true,
      },
      update: {
        code: s.code,
        name: s.name,
        description: s.description,
        enabled: true,
      },
    });
  }

  const files: Array<{ file: string; code: string; name: string }> = [
    { file: "formula.json", code: "formula", name: "方剂" },
    { file: "herb.json", code: "herb", name: "中药" },
    { file: "acupoint.json", code: "acupoint", name: "腧穴" },
  ];

  const perSubjectItems: Record<string, number> = {};
  let totalKp = 0;
  // 收集所有出现过的 KP 类型，用于补 QuestionTemplate（出题必需，否则 generate-question 报 422）
  const kpTypes = new Set<string>();

  for (const f of files) {
    const data = loadDataset(f.file);
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      console.log(`[seed] ${f.name}(${f.code}): items 为空，跳过 ContentItem/KnowledgePoint 写入`);
      perSubjectItems[f.code] = 0;
      continue;
    }

    let itemCount = 0;
    let kpCount = 0;

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item) continue;
      // subjectId 直接取 item.subject（== 我们写入的 Subject id/code）
      await prisma.contentItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          subjectId: item.subject,
          slug: item.slug,
          name: item.name,
          status: "published",
          sortOrder: i,
        },
        update: {
          subjectId: item.subject,
          slug: item.slug,
          name: item.name,
          status: "published",
          sortOrder: i,
        },
      });
      itemCount++;

      for (const kp of item.knowledgePoints ?? []) {
        await prisma.knowledgePoint.upsert({
          where: { id: kp.id },
          create: {
            id: kp.id,
            contentItemId: item.id,
            code: kp.code,
            type: kp.type,
            title: kp.title,
            canonicalAnswer: kp.canonicalAnswer,
            explanation: kp.explanation ?? "",
            status: (kp.status as "draft" | "published" | "archived") ?? "published",
            sortOrder: kp.sortOrder,
          },
          update: {
            contentItemId: item.id,
            code: kp.code,
            type: kp.type,
            title: kp.title,
            canonicalAnswer: kp.canonicalAnswer,
            explanation: kp.explanation ?? "",
            status: (kp.status as "draft" | "published" | "archived") ?? "published",
            sortOrder: kp.sortOrder,
          },
        });
        kpTypes.add(kp.type);
        kpCount++;
      }
    }

    perSubjectItems[f.code] = itemCount;
    totalKp += kpCount;
    console.log(`[seed] ${f.name}(${f.code}): ContentItem=${itemCount}, KnowledgePoint=${kpCount}`);
  }

  // 2) 为每个出现过的 KP 类型补 free_recall 模板（@@unique [knowledgePointType, type]）。
  //    出题器 registry 默认登记 free_recall；recognition 需要 sibling，数据里已有足够同类型 KP，
  //    这里一并补上 recognition；fill_blank 依赖分隔符配置，先不建（前端会自动回退 free_recall）。
  let tplCount = 0;
  for (const kpType of kpTypes) {
    for (const t of ["free_recall", "recognition"] as const) {
      await prisma.questionTemplate.upsert({
        where: { knowledgePointType_type: { knowledgePointType: kpType, type: t } },
        create: { knowledgePointType: kpType, type: t, difficulty: 0.5, enabled: true },
        update: { enabled: true },
      });
      tplCount++;
    }
  }
  console.log(`[seed] QuestionTemplate 已建/确认 ${tplCount} 条（${kpTypes.size} 个 KP 类型 × free_recall/recognition）`);

  // 验证输出
  const subjects = await prisma.subject.findMany({ orderBy: { code: "asc" } });
  console.log("\n=== 验证 ===");
  for (const s of subjects) {
    const cnt = await prisma.contentItem.count({ where: { subjectId: s.id } });
    console.log(`Subject id=${s.id} name=${s.name} enabled=${s.enabled} ContentItem=${cnt}`);
  }
  const totalItems = await prisma.contentItem.count();
  const totalKpDb = await prisma.knowledgePoint.count();
  console.log(`ContentItem 总数=${totalItems}`);
  console.log(`KnowledgePoint 总数=${totalKpDb} (本批写入=${totalKp})`);
}

main()
  .catch((e) => {
    console.error("[seed] 失败:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
