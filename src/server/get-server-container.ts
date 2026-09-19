/**
 * 服务端容器装配（Next.js Route Handler 专用）。
 *
 * 为什么不直接调 createContainer()？
 *   createContainer() 默认用生产 PostgreSQL 单例（@/shared/infrastructure/prisma-client），
 *   而本机开发环境 PostgreSQL 未启动，直接构造会在首次请求时连接失败。
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

// 并行代理 B 生成的 SQLite dev PrismaClient。
// 暂缺时先以 @ts-ignore 兜底（不能用 @ts-expect-error，否则 B 生成后会变成
// "未使用指令" 错误）；B 生成后此 import 必须能解析。
// @ts-ignore -- ./generated/prisma-dev 由并行代理 B 生成，暂缺时忽略
import { PrismaClient as DevPrisma } from "./generated/prisma-dev";

/** 是否走开发态 SQLite 容器。 */
function useDevContainer(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}

let containerCache: Container | null = null;
let routerCache: ApiRouter | null = null;

/** 取服务端容器（开发态 SQLite，生产态 PostgreSQL），进程内单例。 */
export function getServerContainer(): Container {
  if (containerCache) return containerCache;

  if (useDevContainer()) {
    // SQLite dev client 与生产 @prisma/client 的 PrismaClient 类型结构存在
    // 细微差异（$transaction 隔离级别联合类型），与测试侧 test-db.ts 一样在
    // 边界做一次类型桥接：运行时模型完全一致，仓储只通过 model delegate 调用。
    // import 已被上方 @ts-ignore 兜底，DevPrisma 此处为可用绑定。
    const devPrisma = new DevPrisma() as unknown as PrismaClient;
    containerCache = createContainer(devPrisma);
  } else {
    containerCache = createContainer();
  }
  return containerCache;
}

/** 取装配好全部 20 个端点的 ApiRouter，进程内单例。 */
export function getServerRouter(): ApiRouter {
  if (routerCache) return routerCache;
  routerCache = buildRouter(getServerContainer());
  return routerCache;
}
