/**
 * Identity 集成测试（架构文档 §6 / §41，BR-071）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RegisterUser } from "@/modules/identity/application/register-user";
import { LoginUser } from "@/modules/identity/application/login-user";
import { VerifyEmail } from "@/modules/identity/application/verify-email";
import { RequestPasswordReset } from "@/modules/identity/application/request-password-reset";
import { ResetPassword } from "@/modules/identity/application/reset-password";
import { LogoutSession } from "@/modules/identity/application/logout-session";
import { WhoAmI } from "@/modules/identity/application/whoami";
import { CompleteOnboarding } from "@/modules/identity/application/complete-onboarding";
import { ScryptPasswordHasher } from "@/modules/identity/infrastructure/scrypt-password-hasher";
import {
  createInMemoryIdentityRepos,
  createInMemoryIdentityStore,
  type InMemoryIdentityStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import { createNoopUnitOfWork } from "@/tests/e2e/helpers/noop-unit-of-work";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { ConflictError, UnauthorizedError, ValidationError } from "@/shared/errors";

const EMAIL = "student@example.com";
const PASSWORD = "correct-horse-9";
const TZ = "Asia/Shanghai";
const NOW = new Date("2026-09-17T08:00:00.000Z");

function makeUnitOfWork(): UnitOfWork {
  return createNoopUnitOfWork();
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
    const result = await uc.execute({ email: EMAIL, password: PASSWORD, name: "学生", timezone: TZ });

    expect(result.user.email).toBe(EMAIL);
    expect(result.user.emailVerifiedAt).toBeNull();
    expect(result.user.timezone).toBe(TZ);
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
    await uc.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });
    await expect(
      uc.execute({ email: EMAIL.toUpperCase(), password: PASSWORD, timezone: TZ }) // 大小写归一
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("密码少于 8 位抛 ValidationError", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    await expect(uc.execute({ email: EMAIL, password: "short", timezone: TZ })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("登录：正确凭据成功，错误凭据统一 UnauthorizedError（不泄露邮箱是否存在）", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });

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
    const { verificationToken } = await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });

    const verify = new VerifyEmail({ repos, uow: makeUnitOfWork(), now: () => NOW });
    const result = await verify.execute({ token: verificationToken });
    expect(result.user.emailVerifiedAt).not.toBeNull();

    await expect(verify.execute({ token: verificationToken })).rejects.toBeInstanceOf(ValidationError);
  });

  it("重置密码：令牌一次性；重置后旧密码失效、新密码可登录", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "user-1", now: () => NOW });
    await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });

    const request = new RequestPasswordReset({ repos, idGen: () => "token-1", now: () => NOW });
    const { resetToken } = await request.execute({ email: EMAIL });
    expect(resetToken).not.toBeNull();

    const reset = new ResetPassword({ repos, hasher, uow: makeUnitOfWork(), now: () => new Date("2026-09-17T08:30:00.000Z") });
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

  it("BR-093：缺时区注册抛 ValidationError（不再默认 Asia/Shanghai）", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    // @ts-expect-error BR-093：timezone 现为必填，这里显式验证缺省行为
    await expect(uc.execute({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(ValidationError);
  });

  it("BR-093：空时区注册抛 ValidationError", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    await expect(
      uc.execute({ email: EMAIL, password: PASSWORD, timezone: "   " })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("BR-093：无效 IANA 时区注册抛 ValidationError", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    await expect(
      uc.execute({ email: EMAIL, password: PASSWORD, timezone: "Mars/Olympus" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("合法时区原样落库（trim 后保留 IANA 标识）", async () => {
    const uc = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), now: () => NOW });
    const result = await uc.execute({
      email: EMAIL,
      password: PASSWORD,
      timezone: "  America/Los_Angeles  ",
    });
    expect(result.user.timezone).toBe("America/Los_Angeles");
  });
});

describe("Identity：登录会话 / 登出 / whoami（Phase 5）", () => {
  let store: InMemoryIdentityStore;
  let repos: ReturnType<typeof createInMemoryIdentityRepos>;
  let hasher: ScryptPasswordHasher;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
    repos = createInMemoryIdentityRepos(store);
    hasher = new ScryptPasswordHasher();
  });

  async function seedUser(): Promise<string> {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "u-sess", now: () => NOW });
    const r = await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });
    return r.user.id;
  }

  it("BR-091：邮箱前后空白 + 大小写归一化视为重复 → ConflictError", async () => {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "u-1", now: () => NOW });
    await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });
    // 大写 + 前后空白：归一化后应命中已存在邮箱
    await expect(
      register.execute({ email: "  " + EMAIL.toUpperCase() + "  ", password: PASSWORD, timezone: TZ })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("登录签发会话；whoami 校验通过；登出后 whoami 失败", async () => {
    await seedUser();

    const login = new LoginUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "sess-1", now: () => NOW });
    const logged = await login.execute({ email: EMAIL, password: PASSWORD });
    expect(logged.sessionToken).not.toBeNull();
    expect(logged.sessionToken).toHaveLength(64);
    // 库里存的是哈希，不是明文
    const row = [...store.sessions.values()][0]!;
    expect(row.tokenHash).not.toBe(logged.sessionToken);

    // whoami 用明文令牌可解析出用户
    const whoami = new WhoAmI({ repos, now: () => NOW });
    const me = await whoami.execute({ token: logged.sessionToken! });
    expect(me.user.email).toBe(EMAIL);

    // 登出
    const logout = new LogoutSession({ repos, uow: makeUnitOfWork(), now: () => NOW });
    await expect(logout.execute({ token: logged.sessionToken! })).resolves.toEqual({ revoked: true });

    // 登出后会话失效
    await expect(whoami.execute({ token: logged.sessionToken! })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("会话过期后 whoami 失败；伪造令牌也失败", async () => {
    await seedUser();
    const login = new LoginUser({
      repos,
      hasher,
      uow: makeUnitOfWork(),
      idGen: () => "sess-2",
      now: () => NOW,
      sessionTtlMs: 1000,
    });
    const logged = await login.execute({ email: EMAIL, password: PASSWORD });

    // 现在（=NOW）未过期
    const whoami = new WhoAmI({ repos, now: () => NOW });
    await expect(whoami.execute({ token: logged.sessionToken! })).resolves.toMatchObject({
      user: { email: EMAIL },
    });

    // 时间快进 2s（已过 1s TTL）
    const expiredWhoami = new WhoAmI({ repos, now: () => new Date(NOW.getTime() + 2000) });
    await expect(expiredWhoami.execute({ token: logged.sessionToken! })).rejects.toBeInstanceOf(UnauthorizedError);

    // 伪造令牌
    await expect(whoami.execute({ token: "deadbeef".repeat(8) })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("登出幂等：重复登出不报错；非法令牌抛 UnauthorizedError", async () => {
    await seedUser();
    const login = new LoginUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "sess-3", now: () => NOW });
    const logged = await login.execute({ email: EMAIL, password: PASSWORD });

    const logout = new LogoutSession({ repos, uow: makeUnitOfWork(), now: () => NOW });
    await logout.execute({ token: logged.sessionToken! });
    await expect(logout.execute({ token: logged.sessionToken! })).resolves.toEqual({ revoked: true });

    await expect(logout.execute({ token: "nope".repeat(16) })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("Identity：Onboarding 选科目（Phase 5）", () => {
  let store: InMemoryIdentityStore;
  let repos: ReturnType<typeof createInMemoryIdentityRepos>;
  let hasher: ScryptPasswordHasher;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
    repos = createInMemoryIdentityRepos(store);
    hasher = new ScryptPasswordHasher();
  });

  async function seedUser(): Promise<string> {
    const register = new RegisterUser({ repos, hasher, uow: makeUnitOfWork(), idGen: () => "u-onb", now: () => NOW });
    const r = await register.execute({ email: EMAIL, password: PASSWORD, timezone: TZ });
    return r.user.id;
  }

  it("Onboarding：写入科目偏好 + 复用既有 profile，不触碰任何学习状态", async () => {
    const userId = await seedUser();
    // 注册时已建 profile
    expect(store.profiles.size).toBe(1);

    const onboarding = new CompleteOnboarding({ repos, uow: makeUnitOfWork(), now: () => NOW });
    const result = await onboarding.execute({ userId, subjectIds: ["formula", "herb", "acupoint"] });

    expect(result.preferences).toHaveLength(3);
    expect(result.preferences.map((p) => p.subjectId)).toEqual(["formula", "herb", "acupoint"]);
    expect(store.subjectPrefs.size).toBe(3);
    // profile 仍是注册时那一条，未被重复创建
    expect(store.profiles.size).toBe(1);
    // identity 内存仓根本不持有学习状态表：全程零 LearningState/StudyDay/StudyPlan 触碰
    expect(Object.keys(store)).not.toContain("learningStates");
  });

  it("Onboarding：空科目列表 → ValidationError；用户不存在 → ValidationError", async () => {
    const userId = await seedUser();
    const onboarding = new CompleteOnboarding({ repos, uow: makeUnitOfWork(), now: () => NOW });

    await expect(onboarding.execute({ userId, subjectIds: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      onboarding.execute({ userId: "ghost", subjectIds: ["formula"] })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
