/**
 * 极简 Web 请求分发器 —— 框架无关，Next.js App Router handler 的本地适配器。
 *
 * 路由 handler 签名：(req: Request, ctx: { params: Record<string,string> }) => Promise<Response>
 * 同时服务于：
 *   1. node:http 真实服务器（src/server/node-server.ts）—— 满足"本地真实启动、可被 HTTP 调用"；
 *   2. vitest 集成测试 —— 直接构造 Request 调 dispatch()，断言 Response 状态码与 body。
 *
 * 路径模式：精确段 + ":param" 段，如 "/api/sessions/:id/items"。
 * 不支持通配尾段；路径未命中返回 404 JSON；方法未命中（路径命中但 method 不符）返回 405。
 *
 * Phase 13 生产加固：构造 ApiRouter 时可传入可选 production 运行时（结构化日志 / requestId /
 * 限流 / 统一错误处理）。未传入时（单元测试直接 new ApiRouter()）行为与历史完全一致；
 * buildRouter 装配时一律注入，形成对外唯一的生产包装层。
 */
import { NotFoundError } from "@/shared/errors";
import { DomainError } from "@/shared/errors";
import { toErrorResponse } from "./http-errors";
import {
  runWithRequestContext,
  getRequestContext,
} from "./production/request-context";
import { isKeyEndpoint, rateLimitGroup, type ProductionRuntime } from "./production/production";

export interface ApiContext {
  params: Record<string, string>;
}

export type ApiHandler = (
  req: Request,
  ctx: ApiContext
) => Promise<Response> | Response;

export interface RouteEntry {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** 如 "/api/me"、"/api/sessions/:id/items" */
  pattern: string;
  handler: ApiHandler;
}

export interface ApiRouterOptions {
  /** Phase 13 生产运行时；缺省时不叠加任何中间件（向后兼容）。 */
  production?: ProductionRuntime;
}

interface CompiledRoute {
  method: string;
  segments: string[]; // 已去掉前导/尾导空串；":x" 段保留冒号
  handler: ApiHandler;
  pattern: string;
}

function compile(pattern: string): string[] {
  return pattern.split("/").filter((s) => s.length > 0);
}

function match(
  segments: string[],
  pathname: string
): Record<string, string> | null {
  const parts = pathname.split("/").filter((s) => s.length > 0);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const part = parts[i]!;
    if (seg.startsWith(":")) {
      params[seg.slice(1)] = decodeURIComponent(part);
    } else if (seg !== part) {
      return null;
    }
  }
  return params;
}

/** dispatchInner 的内部结果：响应 + 命中路由元信息 + 原始错误（供外层记录堆栈/错误码）。 */
interface InnerResult {
  response: Response;
  /** 命中路由的 method/pattern；404/405 时可能无 */
  route?: { method: string; pattern: string };
  /** handler 抛出的原始错误（被 toErrorResponse 转成响应后仍保留，供服务端日志） */
  error?: unknown;
}

function newRequestId(): string {
  return (globalThis as { crypto?: Crypto }).crypto?.randomUUID?.() ??
    `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 给响应追加 x-request-id 头（不改动 body，保持 toErrorResponse/toJsonResponse 契约）。 */
function withRequestIdHeader(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set("x-request-id", requestId);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export class ApiRouter {
  private readonly routes: CompiledRoute[] = [];
  private readonly production?: ProductionRuntime;

  constructor(opts: ApiRouterOptions = {}) {
    this.production = opts.production;
  }

  register(route: RouteEntry): void {
    this.routes.push({
      method: route.method,
      segments: compile(route.pattern),
      handler: route.handler,
      pattern: route.pattern,
    });
  }

  /** 处理一个 Web Request；永不 reject（领域错误已转成错误 Response）。 */
  async dispatch(req: Request): Promise<Response> {
    if (!this.production) {
      return this.dispatchInner(req).then((r) => r.response);
    }
    return this.dispatchWithProduction(req, this.production);
  }

  /**
   * 生产包装层（Phase 13）：
   *   1. 生成/透传 requestId，放入 ALS 请求上下文；
   *   2. 受保护路径做进程内限流，超限 429 + Retry-After；
   *   3. 计时；4. 内层 dispatch（路由匹配 + handler + 错误映射）；
   *   5. 未知错误服务端日志记录堆栈（响应 body 不泄露）；
   *   6. 响应头回写 x-request-id；7. 关键接口写结构化日志。
   */
  private async dispatchWithProduction(req: Request, prod: ProductionRuntime): Promise<Response> {
    let pathname: string;
    try {
      pathname = new URL(req.url).pathname;
    } catch {
      pathname = "/";
    }
    const method = (req.method || "GET").toUpperCase() as
      | "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    const requestId = req.headers.get("x-request-id")?.trim() || newRequestId();
    const clientIp = prod.getClientIp(req);

    return runWithRequestContext({ requestId, clientIp }, async () => {
      const started = Date.now();

      // ── 2. 限流 ──
      const group = rateLimitGroup(method, pathname);
      if (group) {
        const rl = prod.rateLimiter.check(`${clientIp}:${group}`);
        if (!rl.allowed) {
          const body = {
            error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
          };
          const res = new Response(JSON.stringify(body), {
            status: 429,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "retry-after": String(rl.retryAfterSeconds),
              "x-request-id": requestId,
            },
          });
          prod.logger.logRequest({
            requestId,
            method,
            path: pathname,
            durationMs: Date.now() - started,
            status: 429,
            error: "RATE_LIMITED",
          });
          return res;
        }
      }

      // ── 3+4. 内层分发 ──
      const inner = await this.dispatchInner(req);
      const durationMs = Date.now() - started;
      const status = inner.response.status;
      const ctx = getRequestContext();

      // ── 5. 未知错误：服务端记堆栈（响应 body 仍为 toErrorResponse 脱敏后的 INTERNAL）──
      if (inner.error && !(inner.error instanceof DomainError)) {
        prod.logger.logServerError(requestId, inner.error);
      }

      // ── 6. 响应头回写 requestId ──
      const withHeader = withRequestIdHeader(inner.response, requestId);

      // ── 7. 关键接口结构化日志 ──
      if (isKeyEndpoint(method, pathname)) {
        prod.logger.logRequest({
          requestId,
          userId: ctx?.userId,
          method,
          path: pathname,
          durationMs,
          status,
          error: inner.error
            ? inner.error instanceof DomainError
              ? inner.error.code
              : "INTERNAL"
            : undefined,
        });
      }
      return withHeader;
    });
  }

  /** 核心路由匹配 + handler 调用 + 错误映射（不挂生产中间件）。 */
  private async dispatchInner(req: Request): Promise<InnerResult> {
    let pathname: string;
    try {
      pathname = new URL(req.url).pathname;
    } catch {
      return { response: toErrorResponse(new NotFoundError("无效的请求地址")) };
    }

    let methodMatched = false;
    for (const r of this.routes) {
      const params = match(r.segments, pathname);
      if (params === null) continue;
      if (r.method !== req.method) {
        methodMatched = true;
        continue;
      }
      try {
        const response = await r.handler(req, { params });
        return { response, route: { method: r.method, pattern: r.pattern } };
      } catch (err) {
        return {
          response: toErrorResponse(err),
          route: { method: r.method, pattern: r.pattern },
          error: err,
        };
      }
    }

    if (methodMatched) {
      return {
        response: new Response(
          JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "方法不允许" } }),
          { status: 405, headers: { "content-type": "application/json; charset=utf-8" } }
        ),
      };
    }
    return { response: toErrorResponse(new NotFoundError("接口不存在")) };
  }
}
