/**
 * VerifyEmail Use Case —— 邮箱验证（架构文档 §6）。
 * 令牌：明文只出现在响应/邮件；存储用 sha256(tokenHash)。
 */

import { createHash } from "node:crypto";
import { NotFoundError, ValidationError } from "@/shared/errors";
import type { User } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";

export interface VerifyEmailDeps {
  repos: IdentityRepositories;
}

export interface VerifyEmailCommand {
  token: string;
}

export interface VerifyEmailResult {
  user: User;
}

export class VerifyEmail {
  constructor(private readonly deps: VerifyEmailDeps) {}

  async execute(cmd: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const { repos } = this.deps;
    const tokenHash = createHash("sha256").update(cmd.token).digest("hex");

    const token = await repos.tokens.findVerificationToken(tokenHash);
    if (!token) {
      throw new NotFoundError("验证令牌无效");
    }
    if (token.usedAt) {
      throw new ValidationError("验证令牌已使用");
    }
    if (token.expiresAt.getTime() < Date.now()) {
      throw new ValidationError("验证令牌已过期");
    }

    const user = await repos.users.findById(token.userId);
    if (!user) {
      throw new NotFoundError("用户不存在");
    }

    const now = new Date();
    await repos.tokens.saveVerificationToken({ ...token, usedAt: now });
    await repos.users.save({ ...user, emailVerifiedAt: now, updatedAt: now });

    return { user: { ...user, emailVerifiedAt: now, updatedAt: now } };
  }
}
