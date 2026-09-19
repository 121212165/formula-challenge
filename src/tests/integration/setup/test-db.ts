/**
 * test-db.ts —— 真实 SQLite 测试库客户端单例。
 *
 * - 客户端来自 schema.test.prisma 生成的独立输出（.sqlite-client），不污染生产 postgres client。
 * - 连接固定到 prisma/test.db（绝对路径，避免 CWD 歧义）；该库由 global-setup 每次 --force-reset。
 * - 仓储构造期注入的类型是 @prisma/client 的 PrismaClient；SQLite client 与之一一对应（模型完全相同），
 *   在边界处做一次类型桥接（仓储只通过 getClient 调 model delegate，运行时无差异）。
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
// eslint-disable-next-line import/no-unresolved
import { PrismaClient as SqlitePrismaClient } from "../.sqlite-client/index";
import type { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
// setup/ -> integration/ -> tests/ -> src/ -> root
const root = path.resolve(here, "../../../..");
const DB_URL = "file:" + path.join(root, "prisma", "test.db").replace(/\\/g, "/");

let client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!client) {
    client = new SqlitePrismaClient({
      datasourceUrl: DB_URL,
    }) as unknown as PrismaClient;
  }
  return client;
}

/** 测试结束断开连接（每个测试文件 afterAll 调用）。 */
export async function disconnectTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
