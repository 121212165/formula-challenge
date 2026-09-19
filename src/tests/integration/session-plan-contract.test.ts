/**
 * Session / StudyPlan 领域契约测试（TDD 契约 S(session)-1~3、P-1~4）。
 *
 * 本文件只补契约测试，不改实现；所需数据在本文件内自建，不依赖也不修改共享 helper。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError } from "@/shared/errors";
import { StartStudySession } from "@/modules/learning/application/start-study-session";
import { CompleteSession, AbandonSession } from "@/modules/learning/application/end-session";
import { ResumeSession } from "@/modules/learning/application/resume-session";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { CompletePlanItem } from "@/modules/study-plan/application/today-plan";
import { canTransitionSessionItem } from "@/modules/learning/domain/session";
import type { SessionItemStatus } from "@/modules/learning/domain/session";
import {
  createInMemoryRepos,
  createInMemoryStore,
  type InMemoryStore,
} from "@/tests/e2e/helpers/in-memory-repos";
import {
  createInMemoryKnowledgeRepos,
  createInMemoryPlanRepos,
  createInMemoryPlanStore,
  type InMemoryKnowledgeStore,
  type InMemoryPlanStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import { createNoopUnitOfWork } from "@/tests/e2e/helpers/noop-unit-of-work";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";

const USER_ID = "user-001";
const OTHER_USER = "user-002";
const NOW = new Date("2026-09-17T08:00:00.000Z");
const LOCAL_DATE = "2026-09-17";

const KPS: KnowledgePoint[] = [
  {
    id: "kp-1",
    contentItemId: "ci-1",
    code: "mahuangtang.ingredients",
    type: "formula.ingredients",
    title: "麻黄汤·组成",
    canonicalAnswer: "麻黄、桂枝、杏仁、甘草",
    explanation: null,
    difficulty: 1,
    weight: 1,
    status: "published",
    sortOrder: 1,
  },
  {
    id: "kp-2",
    contentItemId: "ci-1",
    code: "mahuangtang.functions",
    type: "formula.functions",
    title: "麻黄汤·功效",
    canonicalAnswer: "发汗解表，宣肺平喘",
    explanation: null,
    difficulty: 1,
    weight: 1,
    status: "published",
    sortOrder: 2,
  },
];

function makeUnitOfWork(): UnitOfWork {
  return createNoopUnitOfWork();
}

/** 递增 ID 生成器：多实体创建时避免 ID 冲突 */
function seqIdGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(3, "0")}`;
}

/** 种一个到期 LearningState（已到期，可被 findDue 命中） */
async function seedDueState(
  repos: ReturnType<typeof createInMemoryRepos>,
  userId: string,
  id: string,
  knowledgePointId: string,
  dueAt: Date
) {
  await repos.learningStates.save({
    id,
    userId,
    knowledgePointId,
    stability: 1,
    difficulty: 1,
    retrievability: 0.2,
    dueAt,
    lastReviewedAt: new Date("2026-09-10T00:00:00.000Z"),
    reviewCount: 3,
    lapseCount: 1,
    lastRating: "hard",
    fsrsState: 2,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

/** 种一个 active SessionItem（可选指定状态）+ evaluated Attempt + Evaluation，供 FinalizeReview 使用 */
async function seedEvaluatedAttempt(
  repos: ReturnType<typeof createInMemoryRepos>,
  opts: {
    sessionId: string;
    sessionItemId: string;
    userId: string;
    knowledgePointId: string;
    itemStatus?: "pending" | "active" | "completed" | "skipped";
    attemptId?: string;
  }
) {
  const attemptId = opts.attemptId ?? "attempt-1";
  await repos.sessionItems.save({
    id: opts.sessionItemId,
    sessionId: opts.sessionId,
    knowledgePointId: opts.knowledgePointId,
    position: 0,
    status: opts.itemStatus ?? "active",
    questionInstanceId: "qi-1",
  });
  await repos.attempts.save({
    id: attemptId,
    userId: opts.userId,
    sessionId: opts.sessionId,
    sessionItemId: opts.sessionItemId,
    questionInstanceId: "qi-1",
    knowledgePointId: opts.knowledgePointId,
    userAnswer: "x",
    startedAt: NOW,
    submittedAt: NOW,
    timeSpentSeconds: 1,
    status: "evaluated",
    clientRequestId: "req-1",
  });
  await repos.evaluations.save({
    id: "ev-1",
    attemptId,
    score: 1,
    isCorrect: true,
    confidence: 0.9,
    feedback: null,
    createdAt: NOW,
  });
  return attemptId;
}

/* ========================================================================= */
/* S(session)-1：SessionItem 属于该 Session（会话间隔离）                     */
/* ========================================================================= */
describe("S-1 SessionItem 属于该 Session（会话隔离）", () => {
  let store: InMemoryStore;
  let kpStore: InMemoryKnowledgeStore;

  beforeEach(() => {
    store = createInMemoryStore();
    kpStore = { knowledgePoints: new Map(KPS.map((k) => [k.id, k])) };
  });

  it("ResumeSession 只返回本 session 的 items，且全部属于同一 sessionId", async () => {
    const repos = createInMemoryRepos(store);
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    const { session } = await start.execute({
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      knowledgePointIds: ["kp-1", "kp-2"],
    });

    const resume = new ResumeSession({ repos });
    const result = await resume.execute({ sessionId: session.id, userId: USER_ID });
    expect(result.items.length).toBeGreaterThan(0);
    // findBySession 结果全部归属本 session
    for (const item of result.items) {
      expect(item.sessionId).toBe(session.id);
    }
  });

  it("ResumeSession 对不存在的 sessionId 抛 NotFoundError（找不到即拒绝）", async () => {
    const repos = createInMemoryRepos(store);
    const resume = new ResumeSession({ repos });
    await expect(
      resume.execute({ sessionId: "session-not-exists", userId: USER_ID })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ResumeSession 跨用户访问他人 sessionId 抛 ForbiddenError（存在但无权，区别于 NotFound）", async () => {
    const repos = createInMemoryRepos(store);
    // 为另一个用户种一条 active 会话
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    const { session } = await start.execute({
      userId: OTHER_USER,
      subjectId: "formula",
      knowledgePointIds: ["kp-1"],
    });

    // 用 user-001 的身份去恢复他人会话 → 会话存在但归属他人 → ForbiddenError（Phase 8 越权补强）
    const resume = new ResumeSession({ repos });
    await expect(
      resume.execute({ sessionId: session.id, userId: USER_ID })
    ).rejects.toBeInstanceOf(ForbiddenError);
    // 真不存在仍是 NotFoundError，二者不可混用
    await expect(
      resume.execute({ sessionId: "session-not-exists", userId: USER_ID })
    ).rejects.toBeInstanceOf(NotFoundError);

    // 本用户身份可恢复，且只看到自己会话的 item
    const own = await resume.execute({ sessionId: session.id, userId: OTHER_USER });
    expect(own.items).toHaveLength(1);
    expect(own.items[0]!.sessionId).toBe(session.id);
  });
});

/* ========================================================================= */
/* S-2：completed 项不可回 pending（终态不可逆）                             */
/* ========================================================================= */
describe("S-2 completed/skipped SessionItem 不可回流", () => {
  it("单元级：canTransitionSessionItem 对 completed/skipped 无任何出边", () => {
    const allTargets: SessionItemStatus[] = ["pending", "active", "completed", "skipped"];
    for (const target of allTargets) {
      expect(canTransitionSessionItem("completed", target)).toBe(false);
      expect(canTransitionSessionItem("skipped", target)).toBe(false);
    }
  });

  it("集成级：FinalizeReview 不会把已 completed 的 item 改回 pending", async () => {
    const store = createInMemoryStore();
    const repos = createInMemoryRepos(store);
    await repos.sessions.save({
      id: "session-1",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: NOW,
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    const attemptId = await seedEvaluatedAttempt(repos, {
      sessionId: "session-1",
      sessionItemId: "item-1",
      userId: USER_ID,
      knowledgePointId: "kp-1",
      itemStatus: "completed", // 已是终态
    });

    const review = new FinalizeReview({
      repos,
      uow: makeUnitOfWork(),
      scheduler: new FsrsScheduler(),
      idGen: () => "review-001",
      now: () => new Date("2026-09-17T09:00:00.000Z"),
      getLocalDate: async () => LOCAL_DATE,
    });
    await review.execute({ attemptId, rating: "good" });

    // 已 completed 的 item 保持 completed，绝不被打回 pending/active
    const item = await repos.sessionItems.findById("item-1");
    expect(item?.status).toBe("completed");
    expect(item?.status).not.toBe("pending");
  });

  it("集成级：CompleteSession 结束会话不改动任何 item 状态", async () => {
    const store = createInMemoryStore();
    const repos = createInMemoryRepos(store);
    await repos.sessions.save({
      id: "session-1",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: NOW,
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    // 一个 completed + 一个 pending 共存
    await repos.sessionItems.save({
      id: "item-1",
      sessionId: "session-1",
      knowledgePointId: "kp-1",
      position: 0,
      status: "completed",
      questionInstanceId: null,
    });
    await repos.sessionItems.save({
      id: "item-2",
      sessionId: "session-1",
      knowledgePointId: "kp-2",
      position: 1,
      status: "pending",
      questionInstanceId: null,
    });

    const complete = new CompleteSession({
      repos,
      uow: makeUnitOfWork(),
      now: () => new Date("2026-09-17T08:10:00.000Z"),
      getLocalDate: async () => LOCAL_DATE,
    });
    await complete.execute({ sessionId: "session-1", userId: USER_ID });

    // completed 仍是 completed，pending 仍是 pending（CompleteSession 不回写 item）
    expect((await repos.sessionItems.findById("item-1"))?.status).toBe("completed");
    expect((await repos.sessionItems.findById("item-2"))?.status).toBe("pending");
  });
});

/* ========================================================================= */
/* S-3：abandoned 会话保留 Attempt 历史                                       */
/* ========================================================================= */
describe("S-3 abandoned 会话保留 Attempt 历史", () => {
  it("AbandonSession 后 Attempt 仍可查到，会话置为 abandoned", async () => {
    const store = createInMemoryStore();
    const repos = createInMemoryRepos(store);
    const kpStore: InMemoryKnowledgeStore = {
      knowledgePoints: new Map(KPS.map((k) => [k.id, k])),
    };
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    const { session } = await start.execute({
      userId: USER_ID,
      subjectId: "formula",
      knowledgePointIds: ["kp-1"],
    });

    // 用 StartStudySession 产生的那个 item 提交 evaluated Attempt 并 FinalizeReview
    const [item] = await repos.sessionItems.findBySession(session.id);
    // StartStudySession 建的 item 为 pending；FinalizeReview 要求 item 处于 active（pending→active→completed）
    await repos.sessionItems.save({ ...item!, status: "active" });
    await repos.attempts.save({
      id: "attempt-1",
      userId: USER_ID,
      sessionId: session.id,
      sessionItemId: item!.id,
      questionInstanceId: "qi-1",
      knowledgePointId: "kp-1",
      userAnswer: "x",
      startedAt: NOW,
      submittedAt: NOW,
      timeSpentSeconds: 1,
      status: "evaluated",
      clientRequestId: "req-1",
    });
    await repos.evaluations.save({
      id: "ev-1",
      attemptId: "attempt-1",
      score: 1,
      isCorrect: true,
      confidence: 0.9,
      feedback: null,
      createdAt: NOW,
    });
    const review = new FinalizeReview({
      repos,
      uow: makeUnitOfWork(),
      scheduler: new FsrsScheduler(),
      idGen: () => "review-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
      getLocalDate: async () => LOCAL_DATE,
    });
    await review.execute({ attemptId: "attempt-1", rating: "good" });

    // Abandon
    const abandon = new AbandonSession({
      repos,
      uow: makeUnitOfWork(),
      now: () => NOW,
      getLocalDate: async () => LOCAL_DATE,
    });
    const result = await abandon.execute({ sessionId: session.id, userId: USER_ID });
    expect(result.session.status).toBe("abandoned");

    // Attempt 历史未被删除，仍可查到
    const attempt = await repos.attempts.findById("attempt-1");
    expect(attempt).not.toBeNull();
    expect(attempt?.sessionId).toBe(session.id);
    expect(attempt?.knowledgePointId).toBe("kp-1");
  });
});

/* ========================================================================= */
/* P-1：每用户/本地日仅 1 个活跃计划（BR-060）                               */
/* ========================================================================= */
describe("P-1 每用户/本地日仅 1 个活跃计划", () => {
  let store: InMemoryStore;
  let planStore: InMemoryPlanStore;

  beforeEach(() => {
    store = createInMemoryStore();
    planStore = createInMemoryPlanStore();
  });

  it("同一 user+localDate 两次生成：planStore 仍只有 1 个，第二次返回同一 plan", async () => {
    const repos = createInMemoryRepos(store);
    await seedDueState(repos, USER_ID, "ls-1", "kp-1", new Date("2026-09-16T00:00:00.000Z"));
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const first = await gen.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: ["kp-2"] });
    const second = await gen.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: [] });

    expect(planStore.plans.size).toBe(1);
    expect(second.plan.id).toBe(first.plan.id);
  });

  it("不同用户同日可各自拥有计划（用户维度隔离）", async () => {
    const repos = createInMemoryRepos(store);
    await seedDueState(repos, USER_ID, "ls-1", "kp-1", new Date("2026-09-16T00:00:00.000Z"));
    await seedDueState(repos, OTHER_USER, "ls-2", "kp-1", new Date("2026-09-16T00:00:00.000Z"));
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const p1 = await gen.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: [] });
    const p2 = await gen.execute({ userId: OTHER_USER, localDate: LOCAL_DATE, newKnowledgePointIds: [] });

    expect(planStore.plans.size).toBe(2);
    expect(p1.plan.id).not.toBe(p2.plan.id);
    expect(p1.plan.userId).toBe(USER_ID);
    expect(p2.plan.userId).toBe(OTHER_USER);
  });
});

/* ========================================================================= */
/* P-2：PlanItem 完成不改 LearningState（BR-062）                            */
/* ========================================================================= */
describe("P-2 CompletePlanItem 不触碰 LearningState", () => {
  it("完成 plan item 后，仓储中 LearningState 各字段保持不变", async () => {
    const store = createInMemoryStore();
    const planStore = createInMemoryPlanStore();
    const repos = createInMemoryRepos(store);
    await seedDueState(repos, USER_ID, "ls-1", "kp-1", new Date("2026-09-16T00:00:00.000Z"));
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const { items } = await gen.execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: ["kp-2"],
    });

    // 完成前快照仓储中的 LearningState
    const before = await repos.learningStates.find(USER_ID, "kp-1");
    expect(before?.reviewCount).toBe(3);

    const complete = new CompletePlanItem({ planRepo, uow: makeUnitOfWork() });
    await complete.execute({ itemId: items[0]!.id });

    // 完成后从仓储重新读出，逐字段比对未被触碰
    const after = await repos.learningStates.find(USER_ID, "kp-1");
    expect(after).not.toBeNull();
    expect(after?.reviewCount).toBe(before!.reviewCount);
    expect(after?.stability).toBe(before!.stability);
    expect(after?.difficulty).toBe(before!.difficulty);
    expect(after?.retrievability).toBe(before!.retrievability);
    expect(after?.dueAt.getTime()).toBe(before!.dueAt.getTime());
    expect(after?.lapseCount).toBe(before!.lapseCount);
    expect(after?.fsrsState).toBe(before!.fsrsState);
  });
});

/* ========================================================================= */
/* P-3：计划器尊重日条目/时长预算（maxReview / maxNew）                       */
/* ========================================================================= */
describe("P-3 计划器尊重日预算 maxReview / maxNew", () => {
  let store: InMemoryStore;
  let planStore: InMemoryPlanStore;

  beforeEach(() => {
    store = createInMemoryStore();
    planStore = createInMemoryPlanStore();
  });

  it("显式预算：5 个 due + 6 个 new，maxReview=2/maxNew=3 → 共 5（review 2 / new 3）", async () => {
    const repos = createInMemoryRepos(store);
    for (let i = 1; i <= 5; i++) {
      await seedDueState(
        repos,
        USER_ID,
        `ls-r${i}`,
        `kp-r${i}`,
        new Date(`2026-09-${10 + i}T00:00:00.000Z`)
      );
    }
    const newIds = ["kp-n1", "kp-n2", "kp-n3", "kp-n4", "kp-n5", "kp-n6"];
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const { items } = await gen.execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: newIds,
      maxReview: 2,
      maxNew: 3,
    });

    expect(items).toHaveLength(5);
    expect(items.filter((i) => i.type === "review")).toHaveLength(2);
    expect(items.filter((i) => i.type === "new")).toHaveLength(3);
  });

  it("不传预算：走默认上限（maxReview=10 / maxNew=5）", async () => {
    const repos = createInMemoryRepos(store);
    for (let i = 1; i <= 12; i++) {
      await seedDueState(
        repos,
        USER_ID,
        `ls-r${i}`,
        `kp-r${i}`,
        new Date(`2026-09-${String(i).padStart(2, "0")}T00:00:00.000Z`)
      );
    }
    const newIds = Array.from({ length: 8 }, (_, i) => `kp-n${i + 1}`);
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const { items } = await gen.execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: newIds,
    });

    // 默认 10 + 5 = 15
    expect(items).toHaveLength(15);
    expect(items.filter((i) => i.type === "review")).toHaveLength(10);
    expect(items.filter((i) => i.type === "new")).toHaveLength(5);
  });
});

/* ========================================================================= */
/* P-4：到期候选优先于新知识点（review 全部排在 new 之前）                    */
/* ========================================================================= */
describe("P-4 到期候选优先于新知识点", () => {
  it("多到期 + 多新知识：所有 review 排在所有 new 之前，且 review 按 dueAt 升序", async () => {
    const store = createInMemoryStore();
    const planStore = createInMemoryPlanStore();
    const repos = createInMemoryRepos(store);
    // 4 个到期，dueAt 乱序写入，验证排序稳定
    await seedDueState(repos, USER_ID, "ls-r3", "kp-r3", new Date("2026-09-15T00:00:00.000Z"));
    await seedDueState(repos, USER_ID, "ls-r1", "kp-r1", new Date("2026-09-11T00:00:00.000Z"));
    await seedDueState(repos, USER_ID, "ls-r4", "kp-r4", new Date("2026-09-16T00:00:00.000Z"));
    await seedDueState(repos, USER_ID, "ls-r2", "kp-r2", new Date("2026-09-13T00:00:00.000Z"));
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const { items } = await gen.execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: ["kp-n1", "kp-n2", "kp-n3"],
    });

    // 前 4 个全部 review，后 3 个全部 new（review 不与 new 交错）
    const types = items.map((i) => i.type);
    const firstNewIdx = types.indexOf("new");
    const lastReviewIdx = types.lastIndexOf("review");
    expect(firstNewIdx).toBeGreaterThan(lastReviewIdx);
    expect(types.slice(0, 4).every((t) => t === "review")).toBe(true);
    expect(types.slice(4).every((t) => t === "new")).toBe(true);

    // review 段按 dueAt 升序：kp-r1(11) < kp-r2(13) < kp-r3(15) < kp-r4(16)
    expect(items.slice(0, 4).map((i) => i.knowledgePointId)).toEqual([
      "kp-r1",
      "kp-r2",
      "kp-r3",
      "kp-r4",
    ]);
  });
});
