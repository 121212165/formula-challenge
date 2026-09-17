/**
 * 黄金测试（架构文档 §66 / learning-model §22 / business-rules §14 硬不变量）
 *
 * Scenario：
 *   Given 一个新用户 + 已发布的 KnowledgePoint "麻黄汤·组成"
 *   When  用户作答 → 系统评价 → 用户选择 Good
 *   Then  恰一个 Attempt / Evaluation / ReviewEvent / LearningState
 *         LearningState.reviewCount = 1，dueAt 在未来
 *
 *   When  同一 Attempt 再次提交 Good
 *   Then  不创建第二个 ReviewEvent，LearningState 不二次推进
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import type { Attempt } from "@/modules/learning/domain/attempt";
import type { Evaluation } from "@/modules/learning/domain/evaluation";
import type { SessionItem, StudySession } from "@/modules/learning/domain/session";
import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { createInMemoryRepos, createInMemoryStore, type InMemoryStore } from "./helpers/in-memory-repos";

const USER_ID = "user-001";
const KP_ID = "kp-mahuangtang-ingredients";
const LOCAL_DATE = "2026-09-17";

function makeUnitOfWork(): UnitOfWork {
  // 内存事务：直接执行（并发保护由 UNIQUE 约束在生产库兜底）
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

async function seedEvaluatedAttempt(
  store: InMemoryStore,
  repos: ReturnType<typeof createInMemoryRepos>,
  attemptId = "attempt-001",
  status: Attempt["status"] = "evaluated"
): Promise<void> {
  const now = new Date("2026-09-17T08:00:00.000Z");
  const session: StudySession = {
    id: "session-001",
    userId: USER_ID,
    subjectId: "formula",
    mode: "daily",
    startedAt: now,
    endedAt: null,
    status: "active",
    durationSeconds: 0,
  };
  const item: SessionItem = {
    id: "session-item-001",
    sessionId: session.id,
    knowledgePointId: KP_ID,
    position: 1,
    status: "active",
    questionInstanceId: "qi-001",
  };
  const attempt: Attempt = {
    id: attemptId,
    userId: USER_ID,
    sessionId: session.id,
    sessionItemId: item.id,
    questionInstanceId: "qi-001",
    knowledgePointId: KP_ID,
    userAnswer: "麻黄、桂枝、杏仁、甘草",
    startedAt: now,
    submittedAt: now,
    timeSpentSeconds: 12,
    status,
    clientRequestId: `req-${attemptId}`,
  };
  const evaluation: Evaluation = {
    id: "evaluation-001",
    attemptId: attempt.id,
    score: 0.9,
    isCorrect: true,
    confidence: 0.8,
    feedback: null,
    createdAt: now,
  };
  await repos.sessions.save(session);
  await repos.sessionItems.save(item);
  await repos.attempts.save(attempt);
  if (status === "evaluated") {
    await repos.attempts.updateStatus(attempt.id, "evaluated");
  }
  await repos.evaluations.save(evaluation);
}

describe("黄金测试：第一次学习 + 重复评级（架构文档 §66）", () => {
  let store: InMemoryStore;
  let repos: ReturnType<typeof createInMemoryRepos>;
  let finalizeReview: FinalizeReview;
  let reviewAt: Date;

  beforeEach(async () => {
    store = createInMemoryStore();
    repos = createInMemoryRepos(store);
    reviewAt = new Date("2026-09-17T08:05:00.000Z");
    finalizeReview = new FinalizeReview({
      repos,
      uow: makeUnitOfWork(),
      scheduler: new FsrsScheduler(),
      idGen: () => `id-${Math.random().toString(36).slice(2, 10)}`,
      now: () => reviewAt,
      getLocalDate: async () => LOCAL_DATE,
    });
    await seedEvaluatedAttempt(store, repos);
  });

  it("第一次 review Good 后：恰好一个 Attempt/Evaluation/ReviewEvent/LearningState，reviewCount=1，dueAt 在未来", async () => {
    const result = await finalizeReview.execute({ attemptId: "attempt-001", rating: "good" });

    expect(result.created).toBe(true);
    expect(result.reviewEvent.attemptId).toBe("attempt-001");
    expect(result.reviewEvent.rating).toBe("good");

    // 恰好一个 ReviewEvent
    expect(store.reviewEvents.size).toBe(1);
    expect(store.reviewEventsByAttemptId.has("attempt-001")).toBe(true);

    // 恰好一个 LearningState
    expect(store.learningStates.size).toBe(1);
    const state = result.learningState;
    expect(state.userId).toBe(USER_ID);
    expect(state.knowledgePointId).toBe(KP_ID);
    expect(state.reviewCount).toBe(1);
    expect(state.lapseCount).toBe(0);
    expect(state.lastRating).toBe("good");
    expect(state.dueAt.getTime()).toBeGreaterThan(reviewAt.getTime());

    // Attempt / Evaluation 各恰好一个
    expect(store.attempts.size).toBe(1);
    expect(store.evaluations.size).toBe(1);

    // 快照一致性
    expect(result.reviewEvent.previousState.reviewCount).toBe(0);
    expect(result.reviewEvent.nextState.reviewCount).toBe(1);
    expect(result.reviewEvent.nextState.dueAt.getTime()).toBe(state.dueAt.getTime());
  });

  it("同一 Attempt 再次提交 Good：不创建第二个 ReviewEvent，LearningState 不二次推进", async () => {
    const first = await finalizeReview.execute({ attemptId: "attempt-001", rating: "good" });
    const dueAfterFirst = first.learningState.dueAt.getTime();

    const second = await finalizeReview.execute({ attemptId: "attempt-001", rating: "good" });

    expect(second.created).toBe(false);
    expect(second.reviewEvent.id).toBe(first.reviewEvent.id);
    expect(store.reviewEvents.size).toBe(1);
    expect(second.learningState.reviewCount).toBe(1);
    expect(second.learningState.dueAt.getTime()).toBe(dueAfterFirst);
  });

  it("未 evaluated 的 Attempt 不能评级（BR-013）", async () => {
    // 重新 seed 一个 submitted 状态的 attempt
    await seedEvaluatedAttempt(store, repos, "attempt-002", "submitted");

    await expect(
      finalizeReview.execute({ attemptId: "attempt-002", rating: "good" })
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(store.reviewEvents.size).toBe(0);
    expect(store.learningStates.size).toBe(0);
  });

  it("不存在的 Attempt 抛出 NotFoundError", async () => {
    await expect(
      finalizeReview.execute({ attemptId: "attempt-404", rating: "good" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Review 后 Attempt 状态机推进到 reviewed", async () => {
    await finalizeReview.execute({ attemptId: "attempt-001", rating: "easy" });
    expect(store.attempts.get("attempt-001")?.status).toBe("reviewed");
  });

  it("StudyDay 按用户时区累计（BR-070/071）", async () => {
    await finalizeReview.execute({ attemptId: "attempt-001", rating: "good" });
    const day = await repos.studyDays.find(USER_ID, LOCAL_DATE);
    expect(day).not.toBeNull();
    expect(day?.attemptCount).toBe(1);
    expect(day?.reviewCount).toBe(1);
    expect(day?.correctCount).toBe(1);
  });
});
