/**
 * 健康检查端点（Phase 13）—— GET /api/health。
 *
 * 真实探测数据库连通：对当前 Prisma 配置（SQLite dev / PG canonical）跑一次轻量 SELECT 1。
 * 返回 { status, db: 'up'|'down', uptime, timestamp }；db 异常时 HTTP 503。
 * 不鉴权、不依赖任何业务数据，是最外层存活探针。
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { toJsonResponse } from "../http-errors";

/** GET /api/health —— 存活 + 数据库连通探针 */
export function getHealth(c: Container): ApiHandler {
  const startedAt = Date.now();
  return async () => {
    let db: "up" | "down" = "up";
    try {
      await c.pingDb();
    } catch {
      db = "down";
    }
    const body = {
      status: db === "up" ? "ok" : "degraded",
      db,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
    return toJsonResponse(body, db === "up" ? 200 : 503);
  };
}
