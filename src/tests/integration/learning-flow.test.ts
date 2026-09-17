/**
 * SubmitAttempt + EvaluateAttempt 集成测试（文档 §50 Scenario 02 前半段）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SubmitAttempt } from "@/modules/learning/application/submit-attempt";
import { EvaluateAttempt } from "@/modules/learning/application/evaluate-attempt";
import { CanonicalMatchEvaluator } from "@/modules/learning/application/evaluator";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import {
  createInMemoryRepos,
  createInMemoryStore,
  type InMemoryStore,
} from "@/tests/e2e/helpers/in-memory-repos";
import {
  createInMemoryKnowledgeRepos,
  createInMemoryQuestionRepos,
  type InMemoryKnowledgeStore,
  type InMemoryQuestionStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { QuestionTemplate } from "@/modules/question/domain/question";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";

const USER_ID = "user-001";
const KP: KnowledgePoint = {
  id: "kp-mahuangtang-ingredients",
  contentItemId: "ci-001",
  code: "mahuangtang.ingredients",
  type: "formula.ingredients",
  title: "麻黄汤·组成",
  canonicalAnswer: "麻黄、桂枝、杏仁、甘草",
  explanation: null,
  difficulty: 1,
  weight: 1,
  status: "published",
  sortOrder: 1,
};

const TEMPLATE: QuestionTemplate = {
  id: "tpl-fr",
  knowledgePointType: "formula.ingredients",
  type: "free_recall",
  difficulty: 1,
  config: {},
  enabled: true,
};

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

async function seedSession(
  store: InMemoryStore,
  qStore: InMemoryQuestionStore,
  itemId = "session-item-001",
  sessionId = "session-001"
) {
  await store.sessions.set(sessionId, {
    id: sessionId,
    userId: USER_ID,
    subjectId: "formula",
    mode: "daily",
    startedAt: new Date("2026-09-17T08:00:00.000Z"),
    endedAt: null,
    status: "active",
    durationSeconds: 0,
  });
  await store.sessionItems.set(itemId, {
    id: itemId,
    sessionId,
    knowledgePointId: KP.id,
    position: 0,
    status: "pending",
    questionInstanceId: "qi-001",
  });
  qStore.instances.set("qi-001", {
    id: "qi-001",
    sessionItemId: itemId,
    knowledgePointId: KP.id,
    templateId: TEMPLATE.id,
    sequence: 0,
    generatedAt: new Date("2026-09-17T08:01:00.000Z"),
  });
}

describe("SubmitAttempt", () => {
  let store: InMemoryStore;
  let submitAttempt: SubmitAttempt;

  beforeEach(() => {
    store = createInMemoryStore();
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    submitAttempt = new SubmitAttempt({
      repos,
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: () => "attempt-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
    });
    void store;
    void kpStore;
    void qStore;
  });

  it("提交有效答案创建 submitted 状态的 Attempt", async () => {
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    submitAttempt = new SubmitAttempt({
      repos,
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: () => "attempt-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
    });
    await seedSession(store, qStore);
    const result = await submitAttempt.execute({
      userId: USER_ID,
      sessionItemId: "session-item-001",
      userAnswer: "麻黄、桂枝、杏仁、甘草",
      clientRequestId: "req-1",
      startedAt: new Date("2026-09-17T08:04:00.000Z"),
    });
    expect(result.created).toBe(true);
    expect(result.attempt.status).toBe("submitted");
    expect(result.attempt.userId).toBe(USER_ID);
    expect(result.attempt.timeSpentSeconds).toBe(60);
    // SessionItem pending → active
    expect(store.sessionItems.get("session-item-001")?.status).toBe("active");
  });

  it("同一 clientRequestId 幂等：第二次返回已有 Attempt（BR-012）", async () => {
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    submitAttempt = new SubmitAttempt({
      repos,
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: () => "attempt-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
    });
    await seedSession(store, qStore);
    const first = await submitAttempt.execute({
      userId: USER_ID,
      sessionItemId: "session-item-001",
      userAnswer: "麻黄",
      clientRequestId: "req-same",
      startedAt: new Date("2026-09-17T08:04:00.000Z"),
    });
    const second = await submitAttempt.execute({
      userId: USER_ID,
      sessionItemId: "session-item-001",
      userAnswer: "完全不同的答案",
      clientRequestId: "req-same",
      startedAt: new Date("2026-09-17T08:04:00.000Z"),
    });
    expect(second.created).toBe(false);
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(second.attempt.userAnswer).toBe("麻黄");
    expect(store.attempts.size).toBe(1);
  });

  it("Session 已结束时拒绝提交", async () => {
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    submitAttempt = new SubmitAttempt({
      repos,
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: () => "attempt-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
    });
    await seedSession(store, qStore);
    await store.sessions.set("session-001", {
      ...store.sessions.get("session-001")!,
      status: "completed",
    });
    await expect(
      submitAttempt.execute({
        userId: USER_ID,
        sessionItemId: "session-item-001",
        userAnswer: "x",
        clientRequestId: "req-2",
        startedAt: new Date("2026-09-17T08:04:00.000Z"),
      })
    ).rejects.toThrow(/active/);
  });
});

describe("EvaluateAttempt", () => {
  let store: InMemoryStore;
  let qStore: InMemoryQuestionStore;
  let evaluateAttempt: EvaluateAttempt;

  beforeEach(() => {
    store = createInMemoryStore();
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    qStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    evaluateAttempt = new EvaluateAttempt({
      repos,
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      questions: createInMemoryQuestionRepos(qStore),
      evaluator: new CanonicalMatchEvaluator(),
      uow: makeUnitOfWork(),
      idGen: () => "evaluation-001",
      now: () => new Date("2026-09-17T08:06:00.000Z"),
    });
  });

  async function seedSubmittedAttempt(answer = "麻黄、桂枝、杏仁、甘草") {
    await seedSession(store, qStore);
    await store.attempts.set("attempt-001", {
      id: "attempt-001",
      userId: USER_ID,
      sessionId: "session-001",
      sessionItemId: "session-item-001",
      questionInstanceId: "qi-001",
      knowledgePointId: KP.id,
      userAnswer: answer,
      startedAt: new Date("2026-09-17T08:04:00.000Z"),
      submittedAt: new Date("2026-09-17T08:05:00.000Z"),
      timeSpentSeconds: 60,
      status: "submitted",
      clientRequestId: "req-1",
    });
  }

  it("正确答案 → isCorrect，状态推进 evaluated", async () => {
    await seedSubmittedAttempt();
    const result = await evaluateAttempt.execute({ attemptId: "attempt-001" });
    expect(result.created).toBe(true);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(1);
    expect(store.attempts.get("attempt-001")?.status).toBe("evaluated");
  });

  it("错误答案 → isCorrect=false，附带参考答案反馈（BR-021）", async () => {
    await seedSubmittedAttempt("桂枝汤");
    const result = await evaluateAttempt.execute({ attemptId: "attempt-001" });
    expect(result.isCorrect).toBe(false);
    expect(result.feedback).toContain("参考答案");
  });

  it("已评价的 Attempt 幂等：不重复评价", async () => {
    await seedSubmittedAttempt();
    await evaluateAttempt.execute({ attemptId: "attempt-001" });
    const second = await evaluateAttempt.execute({ attemptId: "attempt-001" });
    expect(second.created).toBe(false);
    expect(store.evaluations.size).toBe(1);
  });

  it("未 submitted 的 Attempt 不能评价（BR-013）", async () => {
    await seedSubmittedAttempt();
    await store.attempts.set("attempt-001", {
      ...store.attempts.get("attempt-001")!,
      status: "reviewed",
    });
    await expect(evaluateAttempt.execute({ attemptId: "attempt-001" })).rejects.toThrow(
      /submitted/
    );
  });
});

describe("完整链路：Submit → Evaluate → Review", () => {
  it("黄金场景通过真实 Use Case 跑通", async () => {
    const store = createInMemoryStore();
    const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    const repos = createInMemoryRepos(store);
    const knowledgePoints = createInMemoryKnowledgeRepos(kpStore);
    const questions = createInMemoryQuestionRepos(qStore);
    const uow = makeUnitOfWork();
    const now = () => new Date("2026-09-17T08:00:00.000Z");

    // 建会话
    await store.sessions.set("session-001", {
      id: "session-001",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: now(),
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    await store.sessionItems.set("session-item-001", {
      id: "session-item-001",
      sessionId: "session-001",
      knowledgePointId: KP.id,
      position: 0,
      status: "pending",
      questionInstanceId: null,
    });
    // 生成题目
    const generate = new (await import("@/modules/question/application/generate-question")).GenerateQuestion({
      questions,
      knowledgePoints,
      uow,
      idGen: () => "qi-001",
      now,
    });
    await generate.execute({
      sessionItemId: "session-item-001",
      knowledgePointId: KP.id,
    });
    // 更新 item 指向实例
    await store.sessionItems.set("session-item-001", {
      ...store.sessionItems.get("session-item-001")!,
      questionInstanceId: "qi-001",
    });

    // 提交
    const submit = new SubmitAttempt({
      repos,
      questions,
      knowledgePoints,
      uow,
      idGen: () => "attempt-001",
      now: () => new Date("2026-09-17T08:05:00.000Z"),
    });
    await submit.execute({
      userId: USER_ID,
      sessionItemId: "session-item-001",
      userAnswer: "麻黄、桂枝、杏仁、甘草",
      clientRequestId: "req-1",
      startedAt: new Date("2026-09-17T08:04:00.000Z"),
    });

    // 评价
    const evaluate = new EvaluateAttempt({
      repos,
      knowledgePoints,
      questions,
      evaluator: new CanonicalMatchEvaluator(),
      uow,
      idGen: () => "evaluation-001",
      now: () => new Date("2026-09-17T08:06:00.000Z"),
    });
    const ev = await evaluate.execute({ attemptId: "attempt-001" });
    expect(ev.isCorrect).toBe(true);

    // 评级
    const review = new FinalizeReview({
      repos,
      uow,
      scheduler: new FsrsScheduler(),
      idGen: () => "review-001",
      now: () => new Date("2026-09-17T08:07:00.000Z"),
      getLocalDate: async () => "2026-09-17",
    });
    const rv = await review.execute({ attemptId: "attempt-001", rating: "good" });
    expect(rv.created).toBe(true);
    expect(rv.learningState.reviewCount).toBe(1);
    expect(store.reviewEvents.size).toBe(1);
    expect(store.sessionItems.get("session-item-001")?.status).toBe("completed");
  });
});
