/**
 * StudyPlan 状态机集成测试（架构文档 §24）。
 * 合法路径：draft → active → completed；active → expired（终态）。
 * 生成时必须先建 draft，再显式激活到 active；禁止生成即 active。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InvalidStateTransitionError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";
import type { StudyPlan, StudyPlanStatus } from "@/modules/study-plan/domain/study-plan";
import { canTransitionPlan } from "@/modules/study-plan/domain/study-plan";
import type { StudyPlanRepository } from "@/modules/study-plan/domain/study-plan-repository";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { CompleteStudyPlan } from "@/modules/study-plan/application/complete-study-plan";
import { ExpireStudyPlan } from "@/modules/study-plan/application/expire-study-plan";
import {
  createInMemoryPlanRepos,
  createInMemoryPlanStore,
  type InMemoryPlanStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";

const USER_ID = "user-001";
const NOW = new Date("2026-09-18T08:00:00.000Z");
const LOCAL_DATE = "2026-09-18";

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

/** GenerateStudyPlan 用到 learningStates.findDue / findAllByUser 与 reviewEvents.findAllByUser；提供最小空 stub */
function makeLearningReposStub(): LearningRepositories {
  return {
    learningStates: {
      async find() { return null; },
      async save() {},
      async findDue() { return []; },
      async findAllByUser() { return []; },
      async countLearnedByUserAndSubject() { return 0; },
    },
    reviewEvents: {
      async findByAttemptId() { return null; },
      async save() {},
      async findAllByUser() { return []; },
    },
  } as unknown as LearningRepositories;
}

interface Harness {
  planRepo: StudyPlanRepository;
  statusLog: StudyPlanStatus[];
}

/** 包装内存 planRepo，记录每次 savePlan 的状态序列，用于验证先 draft 后 active */
function buildPlanRepo(store: InMemoryPlanStore): Harness {
  const base = createInMemoryPlanRepos(store);
  const statusLog: StudyPlanStatus[] = [];
  const planRepo: StudyPlanRepository = {
    ...base,
    async savePlan(plan: StudyPlan) {
      statusLog.push(plan.status);
      await base.savePlan(plan);
    },
  };
  return { planRepo, statusLog };
}

function makeGen(harness: Harness): GenerateStudyPlan {
  return new GenerateStudyPlan({
    planRepo: harness.planRepo,
    learningRepos: makeLearningReposStub(),
    uow: makeUnitOfWork(),
    idGen: () => "plan-001",
    now: () => NOW,
  });
}

describe("StudyPlan 状态机", () => {
  let store: InMemoryPlanStore;
  let harness: Harness;

  beforeEach(() => {
    store = createInMemoryPlanStore();
    harness = buildPlanRepo(store);
  });

  it("generate 产生的 plan 最终为 active，且落库过程经过 draft", async () => {
    const { plan } = await makeGen(harness).execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: ["kp-1"],
    });
    expect(plan.status).toBe("active");
    // 保存序列：先 draft 落库，再激活为 active
    expect(harness.statusLog).toEqual(["draft", "active"]);
    // 最终持久化状态为 active
    expect((await harness.planRepo.findById(plan.id))?.status).toBe("active");
  });

  it("active → completed 合法", async () => {
    const { plan } = await makeGen(harness).execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: [],
    });
    const done = await new CompleteStudyPlan({
      planRepo: harness.planRepo,
      uow: makeUnitOfWork(),
    }).execute({ planId: plan.id });
    expect(done.plan.status).toBe("completed");
  });

  it("active → expired 合法", async () => {
    const { plan } = await makeGen(harness).execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: [],
    });
    const expired = await new ExpireStudyPlan({
      planRepo: harness.planRepo,
      uow: makeUnitOfWork(),
    }).execute({ planId: plan.id });
    expect(expired.plan.status).toBe("expired");
  });

  it("completed → active 被拒（终态不可回流）", async () => {
    const { plan } = await makeGen(harness).execute({
      userId: USER_ID,
      localDate: LOCAL_DATE,
      newKnowledgePointIds: [],
    });
    await new CompleteStudyPlan({ planRepo: harness.planRepo, uow: makeUnitOfWork() })
      .execute({ planId: plan.id });

    // 再次 complete 一个已 completed 的计划 → 非法迁移
    const again = new CompleteStudyPlan({ planRepo: harness.planRepo, uow: makeUnitOfWork() });
    const err = await again.execute({ planId: plan.id }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidStateTransitionError);
    expect((err as InvalidStateTransitionError).code).toBe("INVALID_STATE_TRANSITION");
    // 状态机契约：completed/expired 无出边
    expect(canTransitionPlan("completed", "active")).toBe(false);
    expect(canTransitionPlan("expired", "active")).toBe(false);
  });

  it("draft → completed 被拒（终态用例不接受 draft）", async () => {
    // 直接种一个 draft 计划（绕过 generate 的自动激活）
    const draft: StudyPlan = {
      id: "plan-draft",
      userId: USER_ID,
      localDate: LOCAL_DATE,
      source: "manual",
      status: "draft",
    };
    await harness.planRepo.savePlan(draft);

    const complete = new CompleteStudyPlan({ planRepo: harness.planRepo, uow: makeUnitOfWork() });
    const err = await complete.execute({ planId: "plan-draft" }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidStateTransitionError);
    // 状态机契约：draft 只能到 active
    expect(canTransitionPlan("draft", "completed")).toBe(false);
    expect((await harness.planRepo.findById("plan-draft"))?.status).toBe("draft");
  });
});
