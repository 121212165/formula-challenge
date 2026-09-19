/**
 * LogoutSession Use Case —— 登出（Phase 5）。
 * 按明文会话令牌的 sha256 哈希找到会话并标记 revokedAt（幂等：已撤销/不存在/过期均不报错，
 * 登出本就应是安全的幂等操作；但令牌非法时抛 UnauthorizedError 以区分调用方错误）。
 * 不删除行，只打撤销标记，保留审计痕迹。
 */

import { createHash } from "node:crypto";
import { UnauthorizedError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { IdentityRepositories } from "../domain/repositories";

export interface LogoutSessionDeps {
  repos: IdentityRepositories;
  uow?: UnitOfWork;
  now?: () => Date;
}

export interface LogoutSessionCommand {
  /** 明文会话令牌（登录响应返回的那个） */
  token: string;
}

export interface LogoutSessionResult {
  revoked: true;
}

export class LogoutSession {
  constructor(private readonly deps: LogoutSessionDeps) {}

  async execute(cmd: LogoutSessionCommand): Promise<LogoutSessionResult> {
    const { repos } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    const tokenHash = createHash("sha256").update(cmd.token).digest("hex");
    const session = await repos.sessions.findByTokenHash(tokenHash);
    if (!session) {
      throw new UnauthorizedError("会话无效");
    }
    // 已撤销视为幂等成功，不重复打时间戳
    if (session.revokedAt) {
      return { revoked: true };
    }

    const revokedAt = now();
    const mark = async () => {
      await repos.sessions.save({ ...session, revokedAt });
    };
    if (this.deps.uow) {
      await this.deps.uow.transaction(mark);
    } else {
      await mark();
    }

    return { revoked: true };
  }
}
