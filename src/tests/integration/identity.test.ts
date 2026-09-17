/**
 * Identity 集成测试（架构文档 §6 / §41，BR-071）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RegisterUser } from "@/modules/identity/application/register-user";
import { LoginUser } from "@/modules/identity/application/login-user";
import { VerifyEmail } from "@/modules/identity/application/verify-email";
import { RequestPasswordReset } from "@/modules/identity/application/request-password-reset";
import { ResetPassword } from "@/modules/identity/application/reset-password";
import { ScryptPasswordHasher } from "@/modules/identity/infrastructure/scrypt-password-hasher";
import {
  createInMemoryIdentityRepos,
  createInMemoryIdentityStore,
  type InMemoryIdentityStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { ConflictError, UnauthorizedError, ValidationError } from "@/shared/errors";

const EMAIL = "student@example.com";
const PASSWORD = "correct-horse-9";
const NOW = new Date("2026-09-17T08:00:00.000Z");

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

describe("Identity：注册 / 登录 / 验证 / 重置", () => {
  let store: InMemoryIdentityStore;
  let repos: ReturnType<typeof createInMemoryIdentityRepos>;
  let hasher: ScryptPasswordHasher;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
    repos = createInMemoryIdentityRepos(store);
    hasher = new ScryptPasswordHasher();
  });

  it("注册：User + Profile + Credential + 验证令牌同事务创建（BR-071）", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    const result = await uc.execute({ email: EMAIL, password: PASSWORD, name: "学生" });

    expect(result.user.email).toBe(EMAIL);
    expect(result.user.emailVerifiedAt).toBeNull();
    expect(result.verificationToken).toHaveLength(64);
    // 全部写入
    expect(store.users.size).toBe(1);
    expect(store.profiles.size).toBe(1);
    expect(store.credentials.size).toBe(1);
    expect(store.verificationTokens.size).toBe(1);
    // 令牌存储的是哈希，不是明文
    const storedToken = [...store.verificationTokens.values()][0]!;
    expect(storedToken.tokenHash).not.toBe(result.verificationToken);
  });

  it("重复邮箱注册抛 ConflictError", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    await uc.execute({ email: EMAIL, password: PASSWORD });
    await expect(
      uc.execute({ email: EMAIL.toUpperCase(), password: PASSWORD }) // 大小写归一
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("密码少于 8 位抛 ValidationError", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    await expect(uc.execute({ email: EMAIL, password: "short" })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("登录：正确凭据成功，错误凭据统一 UnauthorizedError（不泄露邮箱是否存在）", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    await register.execute({ email: EMAIL, password: PASSWORD });

    const login = new LoginUser({ repos, hasher });
    const ok = await login.execute({ email: EMAIL, password: PASSWORD });
    expect(ok.user.email).toBe(EMAIL);

    await expect(login.execute({ email: EMAIL, password: "wrong-password" })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
    await expect(
      login.execute({ email: "ghost@example.com", password: PASSWORD })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("验证邮箱：令牌一次性，二次验证拒绝", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    const { verificationToken } = await register.execute({ email: EMAIL, password: PASSWORD });

    const verify = new VerifyEmail({ repos });
    const result = await verify.execute({ token: verificationToken });
    expect(result.user.emailVerifiedAt).not.toBeNull();

    await expect(verify.execute({ token: verificationToken })).rejects.toBeInstanceOf(ValidationError);
  });

  it("重置密码：令牌一次性；重置后旧密码失效、新密码可登录", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    await register.execute({ email: EMAIL, password: PASSWORD });

    const request = new RequestPasswordReset({ repos, idGen: () => "token-1", now: () => NOW });
    const { resetToken } = await request.execute({ email: EMAIL });
    expect(resetToken).not.toBeNull();

    const reset = new ResetPassword({ repos, hasher, now: () => new Date("2026-09-17T08:30:00.000Z") });
    await reset.execute({ token: resetToken!, newPassword: "brand-new-pass-1" });

    const login = new LoginUser({ repos, hasher });
    await expect(login.execute({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
    const ok = await login.execute({ email: EMAIL, password: "brand-new-pass-1" });
    expect(ok.user.email).toBe(EMAIL);

    await expect(
      reset.execute({ token: resetToken!, newPassword: "another-pass-1" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("重置密码请求不泄露邮箱是否存在（防枚举）", async () => {
    const request = new RequestPasswordReset({ repos, now: () => NOW });
    const result = await request.execute({ email: "ghost@example.com" });
    expect(result.resetToken).toBeNull();
  });
});
