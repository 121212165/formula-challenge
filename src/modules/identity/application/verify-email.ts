/**
 * VerifyEmail Use Case —— 邮箱验证（架构文档 §6）。
 * 令牌：明文只出现在响应/邮件；存储用 sha256(tokenHash)。
 */

import { createHash } from "node:crypto";
import { NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { User } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";

export interface VerifyEmailDeps {
  repos: IdentityRepositories;
  uow: UnitOfWork;
  /** 可注入时钟（测试用），与其它用例保持一致；缺省取真实当前时间 */
  now?: () => Date;
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
    const { repos, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());
    const tokenHash = createHash("sha256").update(cmd.token).digest("hex");

    const token = await repos.tokens.findVerificationToken(tokenHash);
    if (!token) {
      throw new NotFoundError("验证令牌无效");
    }
    if (token.usedAt) {
      throw new ValidationError("验证令牌已使用");
    }
    if (token.expiresAt.getTime() < now().getTime()) {
      throw new ValidationError("验证令牌已过期");
    }

    const user = await repos.users.findById(token.userId);
    if (!user) {
      throw new NotFoundError("用户不存在");
    }

    const stamp = now();
    // token 标记 + user 邮箱验证标记必须同事务，避免半成功（BR-071）
    await uow.transaction(async () => {
      await repos.tokens.saveVerificationToken({ ...token, usedAt: stamp });
      await repos.users.save({ ...user, emailVerifiedAt: stamp, updatedAt: stamp });
    });

    return { user: { ...user, emailVerifiedAt: stamp, updatedAt: stamp } };
  }
}
