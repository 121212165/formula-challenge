/**
 * LoginUser Use Case —— 认证只回答"你是谁"（架构文档 §6）。
 * 凭据失败统一返回 UnauthorizedError（不泄露邮箱是否注册）。
 *
 * Phase 5：登录成功后签发一个 AuthSession（存 token 哈希 + 过期）。
 * uow 可选：传入时与会话写入同事务；不传时（仅做凭据校验的旧调用方）直接返回 user、不签发会话。
 * 会话明文令牌只在本次响应返回一次；库里只落 sha256(tokenHash)。
 */

import { createHash, randomBytes } from "node:crypto";
import { UnauthorizedError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { User, AuthSession } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";
import type { PasswordHasher } from "./password-hasher";
import type { AuditLogger } from "@/server/audit/audit-log";

/** 默认会话有效期：7 天 */
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LoginUserDeps {
  repos: IdentityRepositories;
  hasher: PasswordHasher;
  /** 传入则在事务内签发会话；不传则只做凭据校验（不签发） */
  uow?: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
  /** 会话有效期（默认 7 天） */
  sessionTtlMs?: number;
  /** Phase 13 审计：登录成功在签发会话的同一事务内写 LOGIN_SUCCESS（缺省 no-op） */
  auditLog?: AuditLogger;
}

export interface LoginUserCommand {
  email: string;
  password: string;
}

export interface LoginUserResult {
  user: User;
  /** 明文会话令牌（仅登录响应返回一次）；未签发会话时为 null */
  sessionToken: string | null;
  sessionExpiresAt: Date | null;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class LoginUser {
  constructor(private readonly deps: LoginUserDeps) {}

  async execute(cmd: LoginUserCommand): Promise<LoginUserResult> {
    const { repos, hasher } = this.deps;
    const email = cmd.email.trim().toLowerCase();

    const user = await repos.users.findByEmail(email);
    const credential = user ? await repos.credentials.findByUserId(user.id) : null;
    const ok = credential ? await hasher.verify(cmd.password, credential.passwordHash) : false;
    if (!user || !ok) {
      throw new UnauthorizedError("邮箱或密码错误");
    }

    // 未注入 uow 的调用方：保持旧行为，只返回 user（不签发会话）
    if (!this.deps.uow) {
      return { user, sessionToken: null, sessionExpiresAt: null };
    }

    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());
    const ttl = this.deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;

    const plainToken = randomBytes(32).toString("hex");
    const at = now();
    const expiresAt = new Date(at.getTime() + ttl);
    const session: AuthSession = {
      id: idGen(),
      userId: user.id,
      tokenHash: createHash("sha256").update(plainToken).digest("hex"),
      expiresAt,
      revokedAt: null,
      createdAt: at,
    };

    await this.deps.uow!.transaction(async () => {
      await repos.sessions.save(session);
      // Phase 13：与会话写入同一物理事务（getClient 取 tx），任一失败整体回滚。
      await this.deps.auditLog?.record({
        action: "LOGIN_SUCCESS",
        actorUserId: user.id,
        targetType: "AuthSession",
        targetId: session.id,
        detail: { email },
      });
    });

    return { user, sessionToken: plainToken, sessionExpiresAt: expiresAt };
  }
}
