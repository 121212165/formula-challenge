/**
 * 服务端容器装配（Next.js Route Handler 专用）。
 *
 * 为什么异步？
 *   dev 态依赖的 SQLite client（./generated/prisma-dev）被 .gitignore 排除，
 *   生产克隆/构建时文件不存在，必须改成动态 import 且只在 dev 分支触发，
 *   否则顶层静态 import 会在生产环境 MODULE_NOT_FOUND。
 *
 * 开发态：用并行代理 B 生成的独立 SQLite dev client（./generated/prisma-dev）注入容器，
 *   这样 Next.js dev 起服无需 PostgreSQL，直接读写已 seed 的 dev.db。
 * 生产态：保持 createContainer() 不变（走环境变量 DATABASE_URL 连 PostgreSQL）。
 *
 * 判定开发态：NODE_ENV !== 'production'，或 DATABASE_URL 以 file: 开头（SQLite 连接串）。
 */
import type { PrismaClient } from "@prisma/client";
import { buildRouter } from "./index";
import { createContainer, type Container } from "./container";
import type { ApiRouter } from "./router";

/** 是否走开发态 SQLite 容器。 */
function useDevContainer(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}

let containerCache: Container | null = null;
let routerCache: ApiRouter | null = null;

/** 取服务端容器（开发态 SQLite，生产态 PostgreSQL），进程内单例。 */
export async function getServerContainer(): Promise<Container> {
  if (containerCache) return containerCache;

  if (useDevContainer()) {
    // SQLite dev client 与生产 @prisma/client 的 PrismaClient 类型结构存在
    // 细微差异（$transaction 隔离级别联合类型），与测试侧 test-db.ts 一样在
    // 边界做一次类型桥接：运行时模型完全一致，仓储只通过 model delegate 调用。
    const { PrismaClient: DevPrisma } = await import("./generated/prisma-dev");
    const devPrisma = new DevPrisma() as unknown as PrismaClient;
    containerCache = createContainer(devPrisma);
  } else {
    containerCache = createContainer();
  }
  return containerCache;
}

/** 取装配好全部 20 个端点的 ApiRouter，进程内单例。 */
export async function getServerRouter(): Promise<ApiRouter> {
  if (routerCache) return routerCache;
  routerCache = buildRouter(await getServerContainer());
  return routerCache;
}
