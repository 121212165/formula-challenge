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

/**
 * 校验是否为合法 IANA 时区标识（BR-093）。
 * 用 Node 内置 Intl 验证，不引入新依赖；非法标识会抛 RangeError。
 */
function isValidTimezone(tz: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface RegisterUserDeps {
  repos: IdentityRepositories;
  hasher: PasswordHasher;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
  /** 验证令牌有效期（默认 24h） */
  tokenTtlMs?: number;
}

export interface RegisterUserCommand {
  email: string;
  password: string;
  name?: string | null;
  /** IANA 时区，必填（BR-093），例如 "Asia/Shanghai" */
  timezone: string;
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

    const email = cmd.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new ValidationError("邮箱格式不正确");
    }
    if (cmd.password.length < 8) {
      throw new ValidationError("密码至少 8 位");
    }
    // BR-093：时区必填且必须是合法 IANA 时区，不再缺省落库（DB 层 @default 仅作兜底）
    const timezone = (cmd.timezone ?? "").trim();
    if (!timezone) {
      throw new ValidationError("时区必填（BR-093）");
    }
    if (!isValidTimezone(timezone)) {
      throw new ValidationError(`无效的时区：${cmd.timezone}`);
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
        timezone,
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
