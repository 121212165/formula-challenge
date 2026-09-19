/**
 * PrismaClient 单例。
 *
 * Next.js 热更新 / 测试进程复用：全局只创建一个根 client，避免连接泄漏。
 * 集成测试会通过 createTestPrismaClient 传入 SQLite 连接串，生产/迁移用 DATABASE_URL。
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(datasourceUrl?: string): PrismaClient {
  return new PrismaClient(
    datasourceUrl ? { datasourceUrl } : undefined
  );
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
