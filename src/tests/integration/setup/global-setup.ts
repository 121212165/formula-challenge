/**
 * Vitest globalSetup —— 真实 SQLite 集成测试的库生命周期前置。
 *
 * 每个 `vitest run` 启动时执行一次（在 worker 加载测试文件之前）：
 *   1. 由 canonical prisma/schema.prisma 重新派生 prisma/schema.test.prisma（SQLite 变体）。
 *   2. `prisma db push --force-reset` 用最新 schema 在 prisma/test.db 上建表并清空数据；
 *      同时重新生成独立的 SQLite PrismaClient（输出到 src/tests/integration/.sqlite-client）。
 *
 * 这样每个测试文件拿到的都是一张干净表，且无需 PostgreSQL。
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// setup/ -> integration/ -> tests/ -> src/ -> root
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export default async function setup(): Promise<void> {
  execSync("node scripts/build-sqlite-schema.cjs", {
    cwd: root,
    stdio: "inherit",
  });
  execSync(
    "npx prisma db push --schema prisma/schema.test.prisma --force-reset --accept-data-loss",
    { cwd: root, stdio: "inherit" }
  );
}
