/**
 * RegisterUser Use Case（架构文档 §41 / §43，BR-071 事务）。
 * 事务：User + UserLearningProfile + EmailVerificationToken 要么全部成功要么全部失败。
 * 认证只回答"你是谁"，不创建任何学习状态。
 */

import { createHash, randomBytes } from "node:crypto";
import { ConflictError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { User, EmailVerificationToken } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";
import type { PasswordHasher } from "./password-hasher";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterUserDeps {
  repos: IdentityRepositories;
  hasher: PasswordHasher;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
  /** 验证令牌有效期（默认 24h） */
  tokenTtlMs?: number;
  /** 默认时区（IANA）；正式版由 onboarding 收集 */
  defaultTimezone?: string;
}

export interface RegisterUserCommand {
  email: string;
  password: string;
  name?: string | null;
  timezone?: string;
}

export interface RegisterUserResult {
  user: User;
  /** 明文验证令牌（仅注册响应返回一次；生产环境走邮件） */
  verificationToken: string;
  verificationTokenExpiresAt: Date;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class RegisterUser {
  constructor(private readonly deps: RegisterUserDeps) {}

  async execute(cmd: RegisterUserCommand): Promise<RegisterUserResult> {
    const { repos, hasher, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());
    const ttl = this.deps.tokenTtlMs ?? 24 * 60 * 60 * 1000;
    const timezone = this.deps.defaultTimezone ?? "Asia/Shanghai";

    const email = cmd.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new ValidationError("邮箱格式不正确");
    }
    if (cmd.password.length < 8) {
      throw new ValidationError("密码至少 8 位");
    }

    return uow.transaction(async () => {
      const existing = await repos.users.findByEmail(email);
      if (existing) {
        throw new ConflictError("该邮箱已注册");
      }

      const createdAt = now();
      const passwordHash = await hasher.hash(cmd.password);

      const user: User = {
        id: idGen(),
        email,
        name: cmd.name ?? null,
        timezone: cmd.timezone ?? timezone,
        emailVerifiedAt: null,
        createdAt,
        updatedAt: createdAt,
      };

      const profile = {
        userId: user.id,
        dailyMinutes: 15,
        dailyItemTarget: 20,
        learningStage: "beginner" as const,
        createdAt,
        updatedAt: createdAt,
      };

      const token = randomBytes(32).toString("hex");
      const verificationToken: EmailVerificationToken = {
        id: idGen(),
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(createdAt.getTime() + ttl),
        usedAt: null,
        createdAt,
      };

      await repos.users.save(user);
      await repos.profiles.save(profile);
      await repos.credentials.save({
        userId: user.id,
        passwordHash,
        createdAt,
        updatedAt: createdAt,
      });
      await repos.tokens.saveVerificationToken(verificationToken);

      return { user, verificationToken: token, verificationTokenExpiresAt: verificationToken.expiresAt };
    });
  }
}
