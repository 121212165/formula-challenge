/**
 * 认证相关路由 handler（框架无关 Web Request/Response）。
 * 每个 export 一个命名工厂，接收 Container 返回 ApiHandler；index.ts 负责注册进 ApiRouter。
 *
 *   POST /api/auth/register  → 201 { user, verificationToken, ... }
 *   POST /api/auth/login     → 200 { user, token, sessionExpiresAt }
 *   POST /api/auth/logout    → 200 { revoked: true }
 *   GET  /api/me             → 200 { user }
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate, extractBearerToken } from "../auth";
import { requireString, readJson } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { UnauthorizedError } from "@/shared/errors";
import { setRequestUserId } from "../production/request-context";

/** POST /api/auth/register */
export function postRegister(c: Container): ApiHandler {
  return async (req) => {
    const body = await readJson(req);
    const email = requireString(body, "email");
    const password = requireString(body, "password");
    const timezone = requireString(body, "timezone");
    const name = typeof body.name === "string" && body.name.length > 0 ? body.name : null;
    const result = await c.registerUser.execute({ email, password, timezone, name });
    setRequestUserId(result.user.id);
    return toJsonResponse(result, 201);
  };
}

/** POST /api/auth/login（容器注入了 uow，故会签发会话 token） */
export function postLogin(c: Container): ApiHandler {
  return async (req) => {
    const body = await readJson(req);
    const email = requireString(body, "email");
    const password = requireString(body, "password");
    try {
      const result = await c.loginUser.execute({ email, password });
      setRequestUserId(result.user.id);
      return toJsonResponse(
        {
          user: result.user,
          token: result.sessionToken,
          sessionExpiresAt: result.sessionExpiresAt,
        },
        200
      );
    } catch (err) {
      // Phase 13：登录失败也落审计（actorUserId 可空，detail 记尝试邮箱）。
      // 失败路径无主业务写入，独立自动提交即可；随后原样抛出由 router 映射 401。
      if (err instanceof UnauthorizedError) {
        await c.auditLog.record({
          action: "LOGIN_FAILURE",
          actorUserId: null,
          targetType: "AuthSession",
          targetId: null,
          detail: { email },
        });
      }
      throw err;
    }
  };
}

/** POST /api/auth/logout（按 Bearer token 撤销会话；幂等） */
export function postLogout(c: Container): ApiHandler {
  return async (req) => {
    const token = extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedError("缺少 Bearer 令牌");
    }
    const result = await c.logoutSession.execute({ token });
    return toJsonResponse(result, 200);
  };
}

/** GET /api/me —— 当前登录用户 */
export function getMe(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    return toJsonResponse({ user }, 200);
  };
}
