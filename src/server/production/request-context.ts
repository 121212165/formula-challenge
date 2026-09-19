/**
 * 请求级上下文（Phase 13 生产加固）—— 用 AsyncLocalStorage 承载单次请求的生产侧元数据。
 *
 * 为什么用 ALS 而不是透传参数？
 *   跨切关注点（requestId / 当前用户 / 审计）若沿方法签名逐层下传，会污染所有领域用例与 handler。
 *   ALS 让"当前请求"在异步调用链内全局可读：
 *     - dispatch 入口 runWithRequestContext 写入 { requestId, userId? }；
 *     - 鉴权后 handler 调 setRequestUserId 回填 userId；
 *     - 审计仓储 / 结构化日志在任意深度读取 getRequestContext()。
 *
 * 与 prisma-tx-context 的 txStore 互不干扰（两个独立 ALS 实例，支持嵌套）。
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  /** 入站透传或新生成的请求 id（链路关联用） */
  requestId: string;
  /** 当前登录用户 id（鉴权后由 handler 回填；匿名请求为 undefined） */
  userId?: string;
  /** 远端 IP（限流 key 用，缺省 127.0.0.1） */
  clientIp: string;
}

const requestStore = new AsyncLocalStorage<RequestContext>();

/** 在给定请求上下文里运行 fn（由 router.dispatch 生产包装层调用）。 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return requestStore.run(ctx, fn);
}

/** 取当前请求上下文；不在请求内（如后台脚本 / 单元测试）返回 undefined。 */
export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}

/** 取当前请求 id；不在请求内返回 undefined。 */
export function getRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}

/** handler 鉴权成功后回填当前用户 id（结构化日志 / 审计共用）。 */
export function setRequestUserId(userId: string): void {
  const ctx = requestStore.getStore();
  if (ctx) ctx.userId = userId;
}
