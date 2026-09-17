/**
 * RequestPasswordReset Use Case —— 忘记密码（架构文档 §6）。
 * 无论邮箱是否存在都返回成功（防用户枚举）；仅当用户存在时生成令牌。
 */

import { createHash, randomBytes } from "node:crypto";
import type { IdentityRepositories } from "../domain/repositories";

export interface RequestPasswordResetDeps {
  repos: IdentityRepositories;
  idGen?: () => string;
  now?: () => Date;
  /** 重置令牌有效期（默认 1h） */
  tokenTtlMs?: number;
}

export interface RequestPasswordResetCommand {
  email: string;
}

export interface RequestPasswordResetResult {
  /** 测试/开发用；生产环境只通过邮件下发 */
  resetToken: string | null;
  resetTokenExpiresAt: Date | null;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class RequestPasswordReset {
  constructor(private readonly deps: RequestPasswordResetDeps) {}

  async execute(cmd: RequestPasswordResetCommand): Promise<RequestPasswordResetResult> {
    const { repos } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());
    const ttl = this.deps.tokenTtlMs ?? 60 * 60 * 1000;

    const email = cmd.email.trim().toLowerCase();
    const user = await repos.users.findByEmail(email);
    if (!user) {
      // 不泄露用户是否存在
      return { resetToken: null, resetTokenExpiresAt: null };
    }

    const token = randomBytes(32).toString("hex");
    const createdAt = now();
    await repos.tokens.savePasswordResetToken({
      id: idGen(),
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(createdAt.getTime() + ttl),
      usedAt: null,
      createdAt,
    });

    return { resetToken: token, resetTokenExpiresAt: new Date(createdAt.getTime() + ttl) };
  }
}
