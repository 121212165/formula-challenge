/**
 * 真实事务集成测试 —— SQLite 真实库 + PrismaUnitOfWork（AsyncLocalStorage 传 tx）。
 *
 * 与既有 in-memory / no-op UoW 测试不同：这里用真实 PrismaClient 连 prisma/test.db，
 * 跨仓储写入真实共享同一物理事务，中途抛错必须整体回滚。
 *
 * 覆盖：
 *   1. FinalizeReview 事务原子性（成功路径：ReviewEvent+LearningState+SessionItem+StudyDay 同事务落库）。
 *   2. FinalizeReview 中途注入失败 → 事务回滚（ReviewEvent / LearningState / Attempt 状态 / StudyDay 全部不落）。
 *   3. RegisterUser 跨仓储事务（User+Profile+Credential+Token 同事务）+ 重复 email → ConflictError（UNIQUE 违反）。
 *   4. SubmitAttempt 幂等：同一 (userId, clientRequestId) 第二次 created:false（DB @@unique 兜底，BR-012）。
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { PrismaUnitOfWork } from "@/shared/infrastructure/prisma-unit-of-work";
import { createPrismaLearningRepos } from "@/modules/learning/infrastructure";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { SubmitAttempt } from "@/modules/learning/application/submit-attempt";
import { PrismaQuestionRepository } from "@/modules/question/infrastructure/prisma-question-repository";
import { PrismaKnowledgePointRepository } from "@/modules/knowledge/infrastructure/prisma-knowledge-point-repository";
import { createPrismaIdentityRepos } from "@/modules/identity/infrastructure/prisma-identity-repos";
import { RegisterUser } from "@/modules/identity/application/register-user";
import { LoginUser } from "@/modules/identity/application/login-user";
import { LogoutSession } from "@/modules/identity/application/logout-session";
import { WhoAmI } from "@/modules/identity/application/whoami";
import { ScryptPasswordHasher } from "@/modules/identity/infrastructure/scrypt-password-hasher";
import { ConflictError, UnauthorizedError } from "@/shared/errors";

const prisma: PrismaClient = getTestPrisma();

interface ChainIds {
  user: string;
  subject: string;
  contentItem: string;
  knowledgePoint: string;
  /** 各链唯一的知识点类型（QuestionTemplate 有 @@unique([knowledgePointType,type])） */
  kpType: string;
  template: string;
  session: string;
  sessionItem: string;
  instance: string;
  attempt: string;
  evaluation: string;
}

/**
 * 直接用真实 PrismaClient 落一条完整前置链（绕过用例，只做种子）：
 * User → Subject → ContentItem(published) → KnowledgePoint(published) →
 * QuestionTemplate → StudySession(active) → SessionItem(active) →
 * QuestionInstance → Attempt(evaluated) → Evaluation。
 */
async function seedChain(ids: ChainIds): Promise<void> {
  await prisma.user.create({
    data: { id: ids.user, email: `${ids.user}@example.com`, timezone: "Asia/Shanghai" },
  });
  await prisma.subject.create({
    data: { id: ids.subject, code: ids.subject, name: "方剂" },
  });
  await prisma.contentItem.create({
    data: {
      id: ids.contentItem,
      subjectId: ids.subject,
      slug: "mahuangtang",
      name: "麻黄汤",
      status: "published",
    },
  });
  await prisma.knowledgePoint.create({
    data: {
      id: ids.knowledgePoint,
      contentItemId: ids.contentItem,
      code: "mahuangtang.ingredients",
      type: ids.kpType,
      title: "麻黄汤·组成",
      canonicalAnswer: "麻黄、桂枝、杏仁、甘草",
      status: "published",
    },
  });
  await prisma.questionTemplate.create({
    data: {
      id: ids.template,
      knowledgePointType: ids.kpType,
      type: "free_recall",
      difficulty: 1,
    },
  });
  await prisma.studySession.create({
    data: {
      id: ids.session,
      userId: ids.user,
      subjectId: ids.subject,
      mode: "daily",
      status: "active",
    },
  });
  await prisma.sessionItem.create({
    data: {
      id: ids.sessionItem,
      sessionId: ids.session,
      knowledgePointId: ids.knowledgePoint,
      position: 0,
      status: "active",
      questionInstanceId: ids.instance,
    },
  });
  await prisma.questionInstance.create({
    data: {
      id: ids.instance,
      sessionItemId: ids.sessionItem,
      knowledgePointId: ids.knowledgePoint,
      templateId: ids.template,
      sequence: 0,
    },
  });
  await prisma.attempt.create({
    data: {
      id: ids.attempt,
      userId: ids.user,
      sessionId: ids.session,
      sessionItemId: ids.sessionItem,
      questionInstanceId: ids.instance,
      knowledgePointId: ids.knowledgePoint,
      userAnswer: "麻黄、桂枝、杏仁、甘草",
      status: "evaluated",
      clientRequestId: `cr-${ids.attempt}`,
    },
  });
  await prisma.evaluation.create({
    data: {
      id: ids.evaluation,
      attemptId: ids.attempt,
      userId: ids.user,
      score: 1,
      isCorrect: true,
    },
  });
}

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("真实事务：FinalizeReview 原子性（SQLite 真实库）", () => {
  it("成功路径：ReviewEvent+LearningState+SessionItem+StudyDay 在同一事务落库", async () => {
    const ids: ChainIds = {
      user: "u-finalize",
      subject: "subj-finalize",
      contentItem: "ci-finalize",
      knowledgePoint: "kp-finalize",
      kpType: "formula.finalize",
      template: "tpl-finalize",
      session: "ss-finalize",
      sessionItem: "si-finalize",
      instance: "qi-finalize",
      attempt: "att-finalize",
      evaluation: "ev-finalize",
    };
    await seedChain(ids);

    const repos = createPrismaLearningRepos(prisma);
    const uow = new PrismaUnitOfWork({ prisma });
    const useCase = new FinalizeReview({
      repos,
      uow,
      scheduler: new FsrsScheduler(),
      idGen: () => "review-finalize",
      now: () => new Date("2026-01-01T08:00:00.000Z"),
      getLocalDate: async () => "2026-01-01",
    });

    const result = await useCase.execute({ attemptId: ids.attempt, rating: "good" });

    expect(result.created).toBe(true);
    expect(result.learningState.reviewCount).toBe(1);

    // 真实库断言：四组写入都在
    const reviewEvent = await prisma.reviewEvent.findUnique({ where: { attemptId: ids.attempt } });
    expect(reviewEvent).not.toBeNull();
    const state = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: ids.user, knowledgePointId: ids.knowledgePoint } },
    });
    expect(state).not.toBeNull();
    expect(state?.fsrsState).toBeTypeOf("number");
    const sessionItem = await prisma.sessionItem.findUnique({ where: { id: ids.sessionItem } });
    expect(sessionItem?.status).toBe("completed");
    const day = await prisma.studyDay.findUnique({
      where: { userId_localDate: { userId: ids.user, localDate: "2026-01-01" } },
    });
    expect(day).not.toBeNull();
    expect(day?.reviewCount).toBe(1);
  });

  it("中途注入失败：事务回滚，ReviewEvent/LearningState/StudyDay 全部不落", async () => {
    const ids: ChainIds = {
      user: "u-rollback",
      subject: "subj-rollback",
      contentItem: "ci-rollback",
      knowledgePoint: "kp-rollback",
      kpType: "formula.rollback",
      template: "tpl-rollback",
      session: "ss-rollback",
      sessionItem: "si-rollback",
      instance: "qi-rollback",
      attempt: "att-rollback",
      evaluation: "ev-rollback",
    };
    await seedChain(ids);

    const repos = createPrismaLearningRepos(prisma);
    // 在 ReviewEvent + LearningState 已写之后、SessionItem 更新处注入一次失败，
    // 验证整个 $transaction 回滚（而非只回滚最后一条）。
    // 注意：不能用 { ...instance } 覆盖（类方法在原型上会丢失），这里显式委托其余方法。
    const origSessionItems = repos.sessionItems;
    repos.sessionItems = {
      findById: (id: string) => origSessionItems.findById(id),
      findBySession: (sessionId: string) => origSessionItems.findBySession(sessionId),
      async save() {
        throw new Error("injected mid-transaction failure");
      },
    };

    const uow = new PrismaUnitOfWork({ prisma });
    const useCase = new FinalizeReview({
      repos,
      uow,
      scheduler: new FsrsScheduler(),
      idGen: () => "review-rollback",
      now: () => new Date("2026-01-01T08:00:00.000Z"),
      getLocalDate: async () => "2026-01-01",
    });

    await expect(
      useCase.execute({ attemptId: ids.attempt, rating: "good" })
    ).rejects.toThrow("injected mid-transaction failure");

    // 回滚断言：事务内已经写过的 ReviewEvent / LearningState 都不得存在
    const reviewEvent = await prisma.reviewEvent.findUnique({ where: { attemptId: ids.attempt } });
    expect(reviewEvent).toBeNull();
    const state = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: ids.user, knowledgePointId: ids.knowledgePoint } },
    });
    expect(state).toBeNull();
    const day = await prisma.studyDay.findUnique({
      where: { userId_localDate: { userId: ids.user, localDate: "2026-01-01" } },
    });
    expect(day).toBeNull();
    // Attempt 状态机也必须回滚（仍是 evaluated，没有变成 reviewed）
    const attempt = await prisma.attempt.findUnique({ where: { id: ids.attempt } });
    expect(attempt?.status).toBe("evaluated");
  });
});

describe("真实事务：RegisterUser 跨仓储 + UNIQUE→ConflictError", () => {
  it("User+Profile+Credential+Token 在同一事务落库", async () => {
    const repos = createPrismaIdentityRepos(prisma);
    const uow = new PrismaUnitOfWork({ prisma });
    const useCase = new RegisterUser({
      repos,
      hasher: new ScryptPasswordHasher(),
      uow,
      idGen: () => "reg-user-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await useCase.execute({
      email: "alice@example.com",
      password: "long-enough-pw",
      timezone: "Asia/Shanghai",
    });

    expect(result.user.id).toBe("reg-user-1");
    // 真实库四行都在
    const user = await prisma.user.findUnique({ where: { id: "reg-user-1" } });
    expect(user?.email).toBe("alice@example.com");
    expect(await prisma.credential.findUnique({ where: { userId: "reg-user-1" } })).not.toBeNull();
    expect(await prisma.userLearningProfile.findUnique({ where: { userId: "reg-user-1" } })).not.toBeNull();
    // userId 非唯一（仅 tokenHash @unique），用 findFirst 取该用户的验证令牌
    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId: "reg-user-1" },
    });
    expect(token?.usedAt).toBeNull();
  });

  it("重复 email → ConflictError（User.email @unique 兜底）", async () => {
    const repos = createPrismaIdentityRepos(prisma);
    const uow = new PrismaUnitOfWork({ prisma });
    const useCase = new RegisterUser({
      repos,
      hasher: new ScryptPasswordHasher(),
      uow,
      idGen: () => "reg-user-2",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await useCase.execute({
      email: "bob@example.com",
      password: "long-enough-pw",
      timezone: "Asia/Shanghai",
    });

    const err = await useCase
      .execute({
        email: "bob@example.com", // 同 email
        password: "another-password",
        timezone: "Asia/Shanghai",
      })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).code).toBe("CONFLICT");
    // 重复注册不应产生第二个 User
    const count = await prisma.user.count({ where: { email: "bob@example.com" } });
    expect(count).toBe(1);
  });
});

describe("真实事务：SubmitAttempt 幂等（BR-012 / @@unique(userId,clientRequestId)）", () => {
  it("同一 clientRequestId 第二次提交 created:false，DB 只有一条 Attempt", async () => {
    const ids: ChainIds = {
      user: "u-submit",
      subject: "subj-submit",
      contentItem: "ci-submit",
      knowledgePoint: "kp-submit",
      kpType: "formula.submit",
      template: "tpl-submit",
      session: "ss-submit",
      sessionItem: "si-submit",
      instance: "qi-submit",
      attempt: "att-submit",
      evaluation: "ev-submit",
    };
    // SubmitAttempt 期望 SessionItem 仍可 pending→active；这里直接给 active 也可，
    // 但为贴近真实，种子用 pending（提交后会推进到 active）。
    await seedChain(ids);
    await prisma.sessionItem.update({
      where: { id: ids.sessionItem },
      data: { status: "pending" },
    });

    const repos = createPrismaLearningRepos(prisma);
    const questions = new PrismaQuestionRepository(prisma);
    const knowledgePoints = new PrismaKnowledgePointRepository(prisma);
    const uow = new PrismaUnitOfWork({ prisma });
    const submit = new SubmitAttempt({
      repos,
      questions,
      knowledgePoints,
      uow,
      idGen: () => "att-submit-first",
      now: () => new Date("2026-01-01T08:05:00.000Z"),
    });

    const first = await submit.execute({
      userId: ids.user,
      sessionItemId: ids.sessionItem,
      userAnswer: "答案 A",
      clientRequestId: "cr-submit-1",
      startedAt: new Date("2026-01-01T08:04:00.000Z"),
    });
    expect(first.created).toBe(true);

    const second = await submit.execute({
      userId: ids.user,
      sessionItemId: ids.sessionItem,
      userAnswer: "答案 B（应被幂等忽略）",
      clientRequestId: "cr-submit-1",
      startedAt: new Date("2026-01-01T08:04:00.000Z"),
    });
    expect(second.created).toBe(false);
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(second.attempt.userAnswer).toBe("答案 A");

    // DB 层 @@unique(userId, clientRequestId) 兜底：只有一条 Attempt
    const cnt = await prisma.attempt.count({ where: { userId: ids.user, clientRequestId: "cr-submit-1" } });
    expect(cnt).toBe(1);
  });
});

describe("真实事务：登录会话签发 / whoami / 登出失效（Phase 5）", () => {
  it("登录在真实事务落 auth_session；whoami 可读；登出后 revokedAt 落库且 whoami 失败", async () => {
    const repos = createPrismaIdentityRepos(prisma);
    const uow = new PrismaUnitOfWork({ prisma });
    const hasher = new ScryptPasswordHasher();

    const register = new RegisterUser({
      repos,
      hasher,
      uow,
      idGen: () => "sess-user-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await register.execute({
      email: "sess-alice@example.com",
      password: "long-enough-pw",
      timezone: "Asia/Shanghai",
    });

    const login = new LoginUser({
      repos,
      hasher,
      uow,
      idGen: () => "auth-sess-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    const logged = await login.execute({ email: "sess-alice@example.com", password: "long-enough-pw" });
    expect(logged.sessionToken).not.toBeNull();

    // 真实库：auth_session 行存在，存的是哈希
    const row = await prisma.authSession.findUnique({ where: { id: "auth-sess-1" } });
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(logged.sessionToken);
    expect(row!.revokedAt).toBeNull();

    // whoami 通过
    const whoami = new WhoAmI({ repos, now: () => new Date("2026-01-01T00:00:00.000Z") });
    await expect(whoami.execute({ token: logged.sessionToken! })).resolves.toMatchObject({
      user: { email: "sess-alice@example.com" },
    });

    // 登出
    const logout = new LogoutSession({ repos, uow, now: () => new Date("2026-01-01T01:00:00.000Z") });
    await logout.execute({ token: logged.sessionToken! });

    // 真实库：revokedAt 已落库
    const revoked = await prisma.authSession.findUnique({ where: { id: "auth-sess-1" } });
    expect(revoked!.revokedAt).not.toBeNull();

    // 登出后 whoami 失败
    await expect(
      whoami.execute({ token: logged.sessionToken! })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
