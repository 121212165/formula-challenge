/**
 * ResetPassword Use Case —— 用令牌重置密码（架构文档 §6）。
 * 令牌有效 → 更新密码哈希 → 令牌标记已用（一次性）。
 */

import { createHash } from "node:crypto";
import { NotFoundError, ValidationError } from "@/shared/errors";
import type { IdentityRepositories } from "../domain/repositories";
import type { PasswordHasher } from "./password-hasher";

export interface ResetPasswordDeps {
  repos: IdentityRepositories;
  hasher: PasswordHasher;
  now?: () => Date;
}

export interface ResetPasswordCommand {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResult {
  success: true;
}

export class ResetPassword {
  constructor(private readonly deps: ResetPasswordDeps) {}

  async execute(cmd: ResetPasswordCommand): Promise<ResetPasswordResult> {
    const { repos, hasher } = this.deps;
    const now = this.deps.now ?? (() => new Date());
    if (cmd.newPassword.length < 8) {
      throw new ValidationError("密码至少 8 位");
    }

    const tokenHash = createHash("sha256").update(cmd.token).digest("hex");
    const token = await repos.tokens.findPasswordResetToken(tokenHash);
    if (!token) {
      throw new NotFoundError("重置令牌无效");
    }
    if (token.usedAt) {
      throw new ValidationError("重置令牌已使用");
    }
    if (token.expiresAt.getTime() < now().getTime()) {
      throw new ValidationError("重置令牌已过期");
    }

    const passwordHash = await hasher.hash(cmd.newPassword);
    const at = now();
    await repos.credentials.save({
      userId: token.userId,
      passwordHash,
      createdAt: at,
      updatedAt: at,
    });
    await repos.tokens.savePasswordResetToken({ ...token, usedAt: at });

    return { success: true };
  }
}
