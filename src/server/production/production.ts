/**
 * 生产运行时装配（Phase 13）—— 把 logger / rateLimiter / IP 解析组合成 router 外层包装所需的运行时。
 *
 * 路由分类（纯函数，便于测试）：
 *   - 限流组：auth（register/login）、attempts、review（attempts review + issue review）、content-issues。
 *   - 关键日志端点：同上六个写接口。
 *
 * 生产部署注意：限流为进程内内存方案，多实例须换 Redis 分布式限流（见 rate-limiter.ts 注释）。
 */
import {
  createRateLimiter,
  type RateLimiter,
} from "./rate-limiter";
import {
  createStructuredLogger,
  stdoutSink,
  type StructuredLogger,
} from "./logger";

export interface ProductionOptions {
  logger?: StructuredLogger;
  rateLimiter?: RateLimiter;
  /** 限流参数覆盖（测试用；缺省读 env） */
  rateLimit?: { max?: number; windowMs?: number };
}

export interface ProductionRuntime {
  logger: StructuredLogger;
  rateLimiter: RateLimiter;
  /** 从 Web Request 解析客户端 IP（x-forwarded-for 首跳 / x-real-ip，缺省 127.0.0.1） */
  getClientIp(req: globalThis.Request): string;
}

/** 构造生产运行时（buildRouter 调用；测试可注入 logger/限流覆盖）。 */
export function createProductionRuntime(opts: ProductionOptions = {}): ProductionRuntime {
  return {
    logger: opts.logger ?? createStructuredLogger(stdoutSink),
    rateLimiter:
      opts.rateLimiter ??
      createRateLimiter(
        opts.rateLimit
          ? { max: opts.rateLimit.max, windowMs: opts.rateLimit.windowMs }
          : {}
      ),
    getClientIp(req) {
      const xff = req.headers.get("x-forwarded-for");
      if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
      }
      const realIp = req.headers.get("x-real-ip");
      return realIp?.trim() || "127.0.0.1";
    },
  };
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** 取受保护路由的限流分组；不受限的路径返回 null。 */
export function rateLimitGroup(method: Method, pathname: string): string | null {
  if (method !== "POST") return null;
  const p = pathname.replace(/\/+$/, "");
  if (p === "/api/auth/register" || p === "/api/auth/login") return "auth";
  if (p === "/api/attempts") return "attempts";
  if (/^\/api\/attempts\/[^/]+\/review$/.test(p)) return "review";
  if (p === "/api/content-issues") return "content-issues";
  if (/^\/api\/admin\/content-issues\/[^/]+\/review$/.test(p)) return "review";
  return null;
}

/** 关键接口（需要结构化日志含 requestId/userId/durationMs/status/error）。 */
export function isKeyEndpoint(method: Method, pathname: string): boolean {
  if (method !== "POST") return false;
  const p = pathname.replace(/\/+$/, "");
  return (
    p === "/api/auth/register" ||
    p === "/api/auth/login" ||
    p === "/api/attempts" ||
    /^\/api\/attempts\/[^/]+\/review$/.test(p) ||
    p === "/api/content-issues" ||
    /^\/api\/admin\/content-issues\/[^/]+\/review$/.test(p)
  );
}
