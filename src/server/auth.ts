/**
 * HTTP 鉴权中间件 —— 从 Authorization: Bearer <token> 取会话令牌并用 WhoAmI 校验。
 *
 * 公开路由（register/login）不挂本中间件；其余写/读路由一律先经 authenticate。
 * 缺 token / 非法 token / 已撤销 / 已过期 → UnauthorizedError（router 自动映射 401）。
 */
import { UnauthorizedError } from "@/shared/errors";
import type { WhoAmI } from "@/modules/identity/application/whoami";
import type { User } from "@/modules/identity/domain/user";

/** 从请求头解析 Bearer 令牌；缺失或格式不符返回 null。 */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export interface AuthenticatedUser {
  user: User;
  token: string;
}

/**
 * 校验登录态。任何失败都抛 UnauthorizedError（不区分原因，防枚举）。
 * 成功返回当前 user（路由层从这里取 userId，绝不信任 body 里的 userId）。
 */
export async function authenticate(req: Request, whoAmI: WhoAmI): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new UnauthorizedError("缺少 Bearer 令牌");
  }
  const { user } = await whoAmI.execute({ token });
  return { user, token };
}
