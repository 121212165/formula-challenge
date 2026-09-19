/**
 * WhoAmI Use Case —— 校验登录态并返回当前用户（Phase 5）。
 * 按明文会话令牌的 sha256 哈希查会话：
 *   - 不存在 / 已撤销 / 已过期 → UnauthorizedError（统一文案，不区分原因）；
 *   - 有效 → 回读用户。
 * 这是"登录态可验证"与"登出后会话失效"的统一入口。
 */

import { createHash } from "node:crypto";
import { NotFoundError, UnauthorizedError } from "@/shared/errors";
import type { User } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";

export interface WhoAmIDeps {
  repos: IdentityRepositories;
  now?: () => Date;
}

export interface WhoAmICommand {
  /** 明文会话令牌 */
  token: string;
}

export interface WhoAmIResult {
  user: User;
}

export class WhoAmI {
  constructor(private readonly deps: WhoAmIDeps) {}

  async execute(cmd: WhoAmICommand): Promise<WhoAmIResult> {
    const { repos } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    const tokenHash = createHash("sha256").update(cmd.token).digest("hex");
    const session = await repos.sessions.findByTokenHash(tokenHash);
    if (!session || session.revokedAt) {
      throw new UnauthorizedError("登录态无效");
    }
    if (session.expiresAt.getTime() < now().getTime()) {
      throw new UnauthorizedError("登录态已过期");
    }

    const user = await repos.users.findById(session.userId);
    if (!user) {
      // 会话存在但用户已被删：理论上被外键级联清理，兜底报 401
      throw new NotFoundError("用户不存在");
    }

    return { user };
  }
}
