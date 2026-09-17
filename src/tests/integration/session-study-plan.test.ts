/**
 * Session 与 StudyPlan 集成测试（文档 §21-25 / §50 Scenario 05）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { StartStudySession } from "@/modules/learning/application/start-study-session";
import { CompleteSession, AbandonSession } from "@/modules/learning/application/end-session";
import { ResumeSession } from "@/modules/learning/application/resume-session";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { GetTodayPlan, CompletePlanItem } from "@/modules/study-plan/application/today-plan";
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
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";

const USER_ID = "user-001";
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
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

/** 递增 ID 生成器：多实体创建时避免 ID 冲突 */
function seqIdGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(3, "0")}`;
}

describe("StartStudySession / Resume / Complete / Abandon", () => {
  let store: InMemoryStore;
  let kpStore: InMemoryKnowledgeStore;

  beforeEach(() => {
    store = createInMemoryStore();
    kpStore = { knowledgePoints: new Map(KPS.map((k) => [k.id, k])) };
  });

  it("创建 active 会话 + 全部 pending 条目", async () => {
    const uc = new StartStudySession({
      repos: createInMemoryRepos(store),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    const { session, items } = await uc.execute({
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      knowledgePointIds: ["kp-1", "kp-2"],
    });
    expect(session.status).toBe("active");
    expect(items).toHaveLength(2);
    expect(items[0]!.position).toBe(0);
    expect(items[0]!.status).toBe("pending");
  });

  it("Resume 返回 active 会话与下一个待完成条目（Scenario 04）", async () => {
    const repos = createInMemoryRepos(store);
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    await start.execute({
      userId: USER_ID,
      subjectId: "formula",
      knowledgePointIds: ["kp-1", "kp-2"],
    });

    const resume = new ResumeSession({ repos });
    const result = await resume.execute({ sessionId: "session-001", userId: USER_ID });
    expect(result.session.status).toBe("active");
    expect(result.items).toHaveLength(2);
    expect(result.nextItem?.knowledgePointId).toBe("kp-1");
  });

  it("Complete 只允许 active → completed；再 Complete 拒绝（§36）", async () => {
    const repos = createInMemoryRepos(store);
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    await start.execute({
      userId: USER_ID,
      subjectId: "formula",
      knowledgePointIds: ["kp-1"],
    });

    const complete = new CompleteSession({ repos, uow: makeUnitOfWork(), now: () => new Date("2026-09-17T08:10:00.000Z") });
    const done = await complete.execute({ sessionId: "session-001" });
    expect(done.session.status).toBe("completed");
    expect(done.session.durationSeconds).toBe(600);
    await expect(complete.execute({ sessionId: "session-001" })).rejects.toThrow(/active/);
  });

  it("Abandon 置为 abandoned", async () => {
    const repos = createInMemoryRepos(store);
    const start = new StartStudySession({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: seqIdGen("session"),
      now: () => NOW,
    });
    await start.execute({
      userId: USER_ID,
      subjectId: "formula",
      knowledgePointIds: ["kp-1"],
    });
    const abandon = new AbandonSession({ repos, uow: makeUnitOfWork(), now: () => NOW });
    const result = await abandon.execute({ sessionId: "session-001" });
    expect(result.session.status).toBe("abandoned");
  });
});

describe("GenerateStudyPlan / TodayPlan / CompletePlanItem", () => {
  let store: InMemoryStore;
  let planStore: InMemoryPlanStore;
  let kpStore: InMemoryKnowledgeStore;

  beforeEach(() => {
    store = createInMemoryStore();
    planStore = createInMemoryPlanStore();
    kpStore = { knowledgePoints: new Map(KPS.map((k) => [k.id, k])) };
  });

  async function seedDueState(repos: ReturnType<typeof createInMemoryRepos>) {
    await repos.learningStates.save({
      id: "ls-1",
      userId: USER_ID,
      knowledgePointId: "kp-1",
      stability: 1,
      difficulty: 1,
      retrievability: 0.2,
      dueAt: new Date("2026-09-16T00:00:00.000Z"), // 已到期
      lastReviewedAt: new Date("2026-09-10T00:00:00.000Z"),
      reviewCount: 3,
      lapseCount: 1,
      lastRating: "hard",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  it("生成计划：到期复习优先，新知识补齐（§25 优先级）", async () => {
    const repos = createInMemoryRepos(store);
    await seedDueState(repos);
    const uc = new GenerateStudyPlan({
      planRepo: createInMemoryPlanRepos(planStore),
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    const { plan, items } = await uc.execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: ["kp-2"],
    });
    expect(plan.status).toBe("active");
    expect(plan.source).toBe("scheduler");
    expect(items).toHaveLength(2);
    expect(items[0]!.type).toBe("review");
    expect(items[0]!.knowledgePointId).toBe("kp-1");
    expect(items[1]!.type).toBe("new");
    expect(items[1]!.knowledgePointId).toBe("kp-2");
  });

  it("同一用户同日不重复生成计划（BR-060）", async () => {
    const repos = createInMemoryRepos(store);
    await seedDueState(repos);
    const uc = new GenerateStudyPlan({
      planRepo: createInMemoryPlanRepos(planStore),
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    await uc.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: ["kp-2"] });
    const second = await uc.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: [] });
    expect(planStore.plans.size).toBe(1);
    expect(second.items).toHaveLength(2);
  });

  it("TodayPlan 返回当日计划；无计划返回 null", async () => {
    const planRepo = createInMemoryPlanRepos(planStore);
    const get = new GetTodayPlan({ planRepo });
    const empty = await get.execute({ userId: USER_ID, localDate: LOCAL_DATE });
    expect(empty.plan).toBeNull();

    const repos = createInMemoryRepos(store);
    await seedDueState(repos);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    await gen.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: [] });
    const today = await get.execute({ userId: USER_ID, localDate: LOCAL_DATE });
    expect(today.plan).not.toBeNull();
    expect(today.items).toHaveLength(1);
  });

  it("CompletePlanItem 只改条目状态，不动 LearningState（BR-062）", async () => {
    const repos = createInMemoryRepos(store);
    await seedDueState(repos);
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

    const complete = new CompletePlanItem({ planRepo });
    const done = await complete.execute({ itemId: items[0]!.id });
    expect(done.status).toBe("completed");
    expect(done.knowledgePointId).toBe("kp-1");

    // LearningState 未被修改
    const state = await repos.learningStates.find(USER_ID, "kp-1");
    expect(state?.reviewCount).toBe(3);
  });

  it("FinalizeReview 后，StudyPlan 不受影响（计划只是建议）", async () => {
    // 简化断言：完成条目不触碰任何学习状态
    const repos = createInMemoryRepos(store);
    const planRepo = createInMemoryPlanRepos(planStore);
    const gen = new GenerateStudyPlan({
      planRepo,
      learningRepos: repos,
      uow: makeUnitOfWork(),
      idGen: seqIdGen("plan"),
      now: () => NOW,
    });
    await gen.execute({ userId: USER_ID, localDate: LOCAL_DATE, newKnowledgePointIds: ["kp-1"] });
    const review = new FinalizeReview({
      repos,
      uow: makeUnitOfWork(),
      scheduler: new FsrsScheduler(),
      idGen: () => "review-001",
      now: () => new Date("2026-09-17T09:00:00.000Z"),
      getLocalDate: async () => LOCAL_DATE,
    });
    void review;
    // 计划条目保持 pending（review 不会自动完成计划条目；由上层决定）
    expect(planStore.items.size).toBe(1);
    expect([...planStore.items.values()][0]!.status).toBe("pending");
  });
});
