/**
 * 领域对象构造与核心不变量单元测试。
 *
 * 覆盖：
 *   - isContentVisible 可见性不变量（架构文档 §38）
 *   - LearningStateDraft 合法构造（learning-model §11）
 *   - Evaluation 契约：isCorrect 是独立 boolean，不从记忆评级推导（BR-020 / BR-022）
 *   - Attempt 幂等键语义：同 clientRequestId 即视为幂等冲突（BR-012）
 */
import { describe, it, expect } from "vitest";
import { isContentVisible, type ContentItemStatus } from "@/modules/content/domain/content";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import type { LearningStateDraft } from "@/modules/learning/domain/learning-state";
import type { Evaluation } from "@/modules/learning/domain/evaluation";
import type { Attempt } from "@/modules/learning/domain/attempt";
import type { ReviewRating } from "@/shared/types/rating";

describe("isContentVisible —— 用户可见性不变量（架构文档 §38）", () => {
  it("仅 published 状态对用户可见 → true", () => {
    expect(isContentVisible("published")).toBe(true);
  });

  it("draft（草稿）不可见 → false", () => {
    expect(isContentVisible("draft")).toBe(false);
  });

  it("review（待审）不可见 → false", () => {
    expect(isContentVisible("review")).toBe(false);
  });

  it("archived（归档）不可见 → false", () => {
    expect(isContentVisible("archived")).toBe(false);
  });

  it("四个状态中恰有一个为 true（published），严格互斥", () => {
    const all: ContentItemStatus[] = ["draft", "review", "published", "archived"];
    const visibleCount = all.filter((s) => isContentVisible(s)).length;
    expect(visibleCount).toBe(1);
  });
});

describe("LearningStateDraft —— 合法构造与字段完整性", () => {
  const now = new Date("2026-09-18T10:00:00Z");
  const scheduler = new FsrsScheduler();

  it("手动构造一个合法 draft，9 个字段类型/取值完整", () => {
    const draft: LearningStateDraft = {
      stability: 3.17,
      difficulty: 5.28,
      retrievability: 0.82,
      dueAt: now,
      lastReviewedAt: now,
      reviewCount: 2,
      lapseCount: 0,
      lastRating: "good",
      fsrsState: 2, // State.Review
    };
    expect(typeof draft.stability).toBe("number");
    expect(typeof draft.difficulty).toBe("number");
    expect(draft.retrievability).toBeGreaterThan(0);
    expect(draft.lastRating).toBe("good");
    expect(draft.reviewCount).toBeGreaterThan(0);
    expect(typeof draft.fsrsState).toBe("number");
  });

  // P2-1：createInitialLearningStateDraft 死代码已删除；初始态统一走 scheduler.initialize()。
  it("scheduler.initialize() 产出未学习基线：stability/difficulty 均为 0", () => {
    const draft = scheduler.initialize(now);
    expect(draft.stability).toBe(0);
    expect(draft.difficulty).toBe(0);
    expect(draft.retrievability).toBe(1);
  });

  it("初始 draft 的 lastReviewedAt / lastRating 必须为 null（无历史）", () => {
    const draft = scheduler.initialize(now);
    expect(draft.lastReviewedAt).toBeNull();
    expect(draft.lastRating).toBeNull();
  });

  it("初始 draft 的 dueAt 锚定到构造时刻，且 fsrsState 为 State.New（0）", () => {
    const draft = scheduler.initialize(now);
    expect(draft.dueAt.getTime()).toBe(now.getTime());
    expect(draft.fsrsState).toBe(0); // State.New
  });
});

describe("Evaluation 契约 —— 系统判断与记忆评级分离（BR-020 / BR-022）", () => {
  // BR-022：Evaluation 绝不直接更新 LearningState；
  // BR-020：isCorrect（系统对错判断）独立于 ReviewRating（学习者记忆评级）。
  // 这里构造一个"记忆评级很差（again）但系统判定作答正确（isCorrect=true）"的组合，
  // 证明两者不是同一量纲、不存在 isCorrect = (rating !== 'again') 的推导关系。
  it("isCorrect 是显式 boolean，而非从 rating 推导", () => {
    const memoryRating: ReviewRating = "again"; // 用户回忆很差

    const evaluation: Evaluation = {
      id: "eval-1",
      attemptId: "att-1",
      score: 1,
      isCorrect: true, // 但本次作答客观正确（例如瞎蒙对了）
      confidence: 0.9,
      feedback: null,
      createdAt: new Date(),
    };

    expect(memoryRating).toBe("again");
    expect(evaluation.isCorrect).toBe(true);
    expect(typeof evaluation.isCorrect).toBe("boolean");
  });

  it("反过来也成立：rating='good' 但 isCorrect=false 的组合同样合法", () => {
    const memoryRating: ReviewRating = "good";
    const evaluation: Evaluation = {
      id: "eval-2",
      attemptId: "att-2",
      score: 0,
      isCorrect: false,
      confidence: 0.4,
      feedback: "作答有误",
      createdAt: new Date(),
    };
    expect(memoryRating).toBe("good");
    expect(evaluation.isCorrect).toBe(false);
  });

  it("Evaluation 携带完整审计字段，feedback 可为 null 或字符串", () => {
    const noFeedback: Evaluation = {
      id: "eval-3",
      attemptId: "att-3",
      score: 1,
      isCorrect: true,
      confidence: 1,
      feedback: null,
      createdAt: new Date(),
    };
    const withFeedback: Evaluation = { ...noFeedback, id: "eval-4", feedback: "很好" };
    expect(noFeedback.feedback).toBeNull();
    expect(withFeedback.feedback).toBe("很好");
    expect(noFeedback.attemptId).toBe("att-3");
  });
});

describe("Attempt 幂等键 —— clientRequestId 语义（BR-012）", () => {
  // UNIQUE(userId, clientRequestId) 在数据库层保证幂等。
  // 这里在单元级复刻该冲突判定语义：id 不同不算新请求，clientRequestId 相同即冲突。
  function isIdempotencyConflict(a: Attempt, b: Attempt): boolean {
    return a.userId === b.userId && a.clientRequestId === b.clientRequestId;
  }

  const base = {
    sessionId: "sess-1",
    sessionItemId: "item-1",
    questionInstanceId: "q-1",
    knowledgePointId: "kp-1",
    userAnswer: "A",
    startedAt: new Date(),
    submittedAt: new Date(),
    timeSpentSeconds: 30,
    status: "submitted" as const,
  };

  it("相同 clientRequestId 但不同 id → 判定为幂等冲突（应被去重）", () => {
    const first: Attempt = { ...base, id: "att-1", userId: "u-1", clientRequestId: "req-abc" };
    const retry: Attempt = { ...base, id: "att-2", userId: "u-1", clientRequestId: "req-abc" };
    expect(first.id).not.toBe(retry.id);
    expect(isIdempotencyConflict(first, retry)).toBe(true);
  });

  it("不同 clientRequestId → 不构成冲突（即使 userId 相同）", () => {
    const a: Attempt = { ...base, id: "att-1", userId: "u-1", clientRequestId: "req-1" };
    const b: Attempt = { ...base, id: "att-2", userId: "u-1", clientRequestId: "req-2" };
    expect(isIdempotencyConflict(a, b)).toBe(false);
  });

  it("跨用户的相同 clientRequestId 不构成冲突（幂等键含 userId 维度）", () => {
    const a: Attempt = { ...base, id: "att-1", userId: "u-1", clientRequestId: "req-shared" };
    const b: Attempt = { ...base, id: "att-2", userId: "u-2", clientRequestId: "req-shared" };
    expect(isIdempotencyConflict(a, b)).toBe(false);
  });

  it("同一对象自比对视为冲突（幂等键等值）", () => {
    const a: Attempt = { ...base, id: "att-1", userId: "u-1", clientRequestId: "req-x" };
    expect(isIdempotencyConflict(a, a)).toBe(true);
  });
});
