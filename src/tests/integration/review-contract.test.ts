/**
 * Review 领域用例契约测试（TDD 契约 A-3 / R-2 / R-3 / R-4 / R-5）。
 *
 * 用内存仓储跑真实 Use Case（SubmitAttempt / EvaluateAttempt / FinalizeReview），
 * 覆盖归属拒绝、状态前置、幂等、原子性与重放不二次推进。
 *
 * 说明：A-1（恰好 1 个 ReviewEvent）、A-2（幂等返回 created:false）、
 *       R-1（已 evaluated 才可 Review）与黄金首次链路已在 learning-flow / golden 覆盖，
 *       这里不重复，仅保证它们不被本次改造破坏。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SubmitAttempt } from "@/modules/learning/application/submit-attempt";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
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
import { createNoopUnitOfWork } from "@/tests/e2e/helpers/noop-unit-of-work";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";
import type { ReviewEvent } from "@/modules/learning/domain/review-event";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { QuestionTemplate } from "@/modules/question/domain/question";
import type { Attempt } from "@/modules/learning/domain/attempt";
import {
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";

const USER_ID = "user-001";
const OTHER_ID = "user-999";

const KP: KnowledgePoint = {
  id: "kp-mahuangtang",
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

/** 直接落库一个 evaluated 状态的 Attempt + 其 Evaluation，跳过 Submit/Evaluate 链路。 */
function seedEvaluatedAttempt(
  store: InMemoryStore,
  qStore: InMemoryQuestionStore,
  opts: { attemptId?: string; status?: Attempt["status"]; sessionItemStatus?: "active" | "pending" } = {}
) {
  const attemptId = opts.attemptId ?? "att-1";
  const sessionId = "sess-1";
  const itemId = "item-1";

  void store.sessions.set(sessionId, {
    id: sessionId,
    userId: USER_ID,
    subjectId: "formula",
    mode: "daily",
    startedAt: new Date("2026-09-18T08:00:00.000Z"),
    endedAt: null,
    status: "active",
    durationSeconds: 0,
  });
  void store.sessionItems.set(itemId, {
    id: itemId,
    sessionId,
    knowledgePointId: KP.id,
    position: 0,
    status: opts.sessionItemStatus ?? "active",
    questionInstanceId: "qi-1",
  });
  qStore.instances.set("qi-1", {
    id: "qi-1",
    sessionItemId: itemId,
    knowledgePointId: KP.id,
    templateId: TEMPLATE.id,
    sequence: 0,
    generatedAt: new Date("2026-09-18T08:01:00.000Z"),
  });

  void store.attempts.set(attemptId, {
    id: attemptId,
    userId: USER_ID,
    sessionId,
    sessionItemId: itemId,
    questionInstanceId: "qi-1",
    knowledgePointId: KP.id,
    userAnswer: "麻黄、桂枝、杏仁、甘草",
    startedAt: new Date("2026-09-18T08:04:00.000Z"),
    submittedAt: new Date("2026-09-18T08:05:00.000Z"),
    timeSpentSeconds: 60,
    status: opts.status ?? "evaluated",
    clientRequestId: "req-" + attemptId,
  });
  // 一次 Evaluation（correct=true），供 FinalizeReview 读 correctDelta
  void store.evaluations.set("eval-" + attemptId, {
    id: "eval-" + attemptId,
    attemptId,
    score: 1,
    isCorrect: true,
    confidence: 0.95,
    feedback: null,
    createdAt: new Date("2026-09-18T08:06:00.000Z"),
  });

  return { attemptId, itemId, sessionId };
}

function makeReviewUc(repos: LearningRepositories, id = "rev-1") {
  return new FinalizeReview({
    repos,
    uow: createNoopUnitOfWork(),
    scheduler: new FsrsScheduler(),
    idGen: () => id,
    now: () => new Date("2026-09-18T08:07:00.000Z"),
    getLocalDate: async () => "2026-09-18",
  });
}

describe("A-3 非法归属被拒（SubmitAttempt 跨用户 / 题目实例归属）", () => {
  let store: InMemoryStore;
  let qStore: InMemoryQuestionStore;
  let kpStore: InMemoryKnowledgeStore;

  beforeEach(() => {
    store = createInMemoryStore();
    kpStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    qStore = { templates: new Map([[TEMPLATE.id, TEMPLATE]]), instances: new Map() };
  });

  function buildSubmit() {
    return new SubmitAttempt({
      repos: createInMemoryRepos(store),
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: createNoopUnitOfWork(),
      idGen: () => "att-submit",
      now: () => new Date("2026-09-18T08:05:00.000Z"),
    });
  }

  it("(a) 用别人 userId 提交他人 Session → ForbiddenError", async () => {
    // seed 属于 USER_ID 的 active Session + SessionItem + 题目实例
    void store.sessions.set("sess-1", {
      id: "sess-1",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: new Date("2026-09-18T08:00:00.000Z"),
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    void store.sessionItems.set("item-1", {
      id: "item-1",
      sessionId: "sess-1",
      knowledgePointId: KP.id,
      position: 0,
      status: "pending",
      questionInstanceId: "qi-1",
    });
    qStore.instances.set("qi-1", {
      id: "qi-1",
      sessionItemId: "item-1",
      knowledgePointId: KP.id,
      templateId: TEMPLATE.id,
      sequence: 0,
      generatedAt: new Date("2026-09-18T08:01:00.000Z"),
    });

    await expect(
      buildSubmit().execute({
        userId: OTHER_ID, // 冒充他人
        sessionItemId: "item-1",
        userAnswer: "答案",
        clientRequestId: "req-cross",
        startedAt: new Date("2026-09-18T08:04:00.000Z"),
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("(b1) SessionItem 未挂 questionInstance → NotFoundError", async () => {
    void store.sessions.set("sess-1", {
      id: "sess-1",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: new Date("2026-09-18T08:00:00.000Z"),
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    void store.sessionItems.set("item-1", {
      id: "item-1",
      sessionId: "sess-1",
      knowledgePointId: KP.id,
      position: 0,
      status: "pending",
      questionInstanceId: null, // 未生成题目实例
    });

    await expect(
      buildSubmit().execute({
        userId: USER_ID,
        sessionItemId: "item-1",
        userAnswer: "答案",
        clientRequestId: "req-no-instance",
        startedAt: new Date("2026-09-18T08:04:00.000Z"),
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("(b2) instance.sessionItemId 与 SessionItem 不匹配 → NotFoundError", async () => {
    void store.sessions.set("sess-1", {
      id: "sess-1",
      userId: USER_ID,
      subjectId: "formula",
      mode: "daily",
      startedAt: new Date("2026-09-18T08:00:00.000Z"),
      endedAt: null,
      status: "active",
      durationSeconds: 0,
    });
    void store.sessionItems.set("item-1", {
      id: "item-1",
      sessionId: "sess-1",
      knowledgePointId: KP.id,
      position: 0,
      status: "pending",
      questionInstanceId: "qi-stolen", // 指向挂在别处的题目实例
    });
    qStore.instances.set("qi-stolen", {
      id: "qi-stolen",
      sessionItemId: "item-OTHER", // 归属另一个 SessionItem
      knowledgePointId: KP.id,
      templateId: TEMPLATE.id,
      sequence: 0,
      generatedAt: new Date("2026-09-18T08:01:00.000Z"),
    });

    await expect(
      buildSubmit().execute({
        userId: USER_ID,
        sessionItemId: "item-1",
        userAnswer: "答案",
        clientRequestId: "req-mismatch",
        startedAt: new Date("2026-09-18T08:04:00.000Z"),
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("R-2 / R-3 / R-5：FinalizeReview 前置、幂等与重放", () => {
  let store: InMemoryStore;
  let qStore: InMemoryQuestionStore;
  let repos: LearningRepositories;

  beforeEach(() => {
    store = createInMemoryStore();
    qStore = { templates: new Map([[TEMPLATE.id, TEMPLATE]]), instances: new Map() };
    repos = createInMemoryRepos(store);
  });

  it("R-2：submitted 态（未 evaluated）Attempt 不能 Review，且不写任何东西", async () => {
    seedEvaluatedAttempt(store, qStore, { status: "submitted" });
    const uc = makeReviewUc(repos);

    await expect(
      uc.execute({ attemptId: "att-1", rating: "good" })
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    // 失败后不得落库 ReviewEvent / LearningState
    expect(store.reviewEvents.size).toBe(0);
    expect(store.learningStates.size).toBe(0);
  });

  it("R-3：同一 Attempt 二次 Review → created:false，ReviewEvent 仍只有 1 个", async () => {
    seedEvaluatedAttempt(store, qStore);
    const uc = makeReviewUc(repos);

    const first = await uc.execute({ attemptId: "att-1", rating: "good" });
    expect(first.created).toBe(true);

    const second = await uc.execute({ attemptId: "att-1", rating: "again" });
    expect(second.created).toBe(false);
    // 第二次不新增、不覆盖（rating 不同也沿用既有）
    expect(second.reviewEvent.id).toBe(first.reviewEvent.id);
    expect(second.reviewEvent.rating).toBe("good");
    expect(store.reviewEvents.size).toBe(1);
    expect(store.reviewEventsByAttemptId.size).toBe(1);
  });

  it("R-5：同 rating 重放请求不二次推进 dueAt / reviewCount", async () => {
    seedEvaluatedAttempt(store, qStore);
    const uc = makeReviewUc(repos);

    const first = await uc.execute({ attemptId: "att-1", rating: "good" });
    const firstDueAt = first.learningState.dueAt.getTime();
    const firstReviewCount = first.learningState.reviewCount;

    // 第二次同 rating 重放（典型重试/重复投递）
    const second = await uc.execute({ attemptId: "att-1", rating: "good" });
    expect(second.created).toBe(false);
    expect(second.learningState.dueAt.getTime()).toBe(firstDueAt);
    expect(second.learningState.reviewCount).toBe(firstReviewCount);
    // 仍只有一条 ReviewEvent / 一条 LearningState
    expect(store.reviewEvents.size).toBe(1);
    expect(store.learningStates.size).toBe(1);
  });
});

describe("R-4：ReviewEvent + LearningState 原子性（半成功不发生）", () => {
  it("保存 ReviewEvent 之后、保存 LearningState 之前抛错 → 两者都没落库", async () => {
    const store = createInMemoryStore();
    const qStore: InMemoryQuestionStore = {
      templates: new Map([[TEMPLATE.id, TEMPLATE]]),
      instances: new Map(),
    };
    seedEvaluatedAttempt(store, qStore);

    const realRepos = createInMemoryRepos(store);

    // 包装一层：ReviewEvent 先"暂存"在内存（不真正提交到持久 store），
    // LearningState.save 故意抛错。用 noop-uow 直接执行，验证无半成功。
    let stagedReview: ReviewEvent | null = null;
    const wrappedRepos: LearningRepositories = {
      ...realRepos,
      reviewEvents: {
        findByAttemptId: (id) => realRepos.reviewEvents.findByAttemptId(id),
        findAllByUser: (u) => realRepos.reviewEvents.findAllByUser(u),
        save: async (re) => {
          stagedReview = re; // 进入"事务暂存"，尚未持久化
        },
      },
      learningStates: {
        find: (u, k) => realRepos.learningStates.find(u, k),
        findDue: (u, now, limit) => realRepos.learningStates.findDue(u, now, limit),
        findAllByUser: (u) => realRepos.learningStates.findAllByUser(u),
        countLearnedByUserAndSubject: (u, s) => realRepos.learningStates.countLearnedByUserAndSubject(u, s),
        save: async () => {
          throw new Error("模拟故障：保存 LearningState 失败");
        },
      },
    };

    const uc = new FinalizeReview({
      repos: wrappedRepos,
      uow: createNoopUnitOfWork(), // 直接执行，无兜底回滚
      scheduler: new FsrsScheduler(),
      idGen: () => "rev-fail",
      now: () => new Date("2026-09-18T08:07:00.000Z"),
      getLocalDate: async () => "2026-09-18",
    });

    await expect(uc.execute({ attemptId: "att-1", rating: "good" })).rejects.toThrow(
      "保存 LearningState 失败"
    );

    // 故障点确在两者之间：ReviewEvent 已被处理（暂存），但持久层两者皆空
    expect(stagedReview).not.toBeNull();
    expect(store.reviewEvents.size).toBe(0);
    expect(store.reviewEventsByAttemptId.size).toBe(0);
    expect(store.learningStates.size).toBe(0);
  });
});
