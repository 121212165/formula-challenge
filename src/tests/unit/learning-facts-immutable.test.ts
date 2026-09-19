/**
 * 不可变事实防篡改 + LearningState 单一构造器 单元测试。
 *
 * 覆盖：
 *   - createImmutableAttempt 产出冻结对象，运行时改写无效（BR-003）
 *   - createImmutableReviewEvent 产出冻结对象，前后快照同样冻结（BR-034）
 *   - LearningStateFromDraft 组装全部字段；空 userId/knowledgePointId 抛 ValidationError（BR-040）
 *   - canTransitionAttempt 线性守卫：reviewed 终态不自环、禁止 submitted→reviewed 跳步（BR-013）
 */
import { describe, it, expect } from "vitest";
import {
  createImmutableAttempt,
  canTransitionAttempt,
  type Attempt,
} from "@/modules/learning/domain/attempt";
import {
  createImmutableReviewEvent,
  type ReviewEvent,
  type ReviewStateSnapshot,
} from "@/modules/learning/domain/review-event";
import {
  LearningStateFromDraft,
  type LearningState,
  type LearningStateDraft,
} from "@/modules/learning/domain/learning-state";
import { ValidationError } from "@/shared/errors";

const NOW = new Date("2026-09-18T10:00:00.000Z");

const baseAttempt: Attempt = {
  id: "att-1",
  userId: "user-001",
  sessionId: "sess-1",
  sessionItemId: "item-1",
  questionInstanceId: "qi-1",
  knowledgePointId: "kp-1",
  userAnswer: "麻黄、桂枝",
  startedAt: new Date("2026-09-18T09:59:00.000Z"),
  submittedAt: NOW,
  timeSpentSeconds: 60,
  status: "submitted",
  clientRequestId: "req-1",
};

const snapshot = (over: Partial<ReviewStateSnapshot> = {}): ReviewStateSnapshot => ({
  stability: 3.17,
  difficulty: 5.28,
  retrievability: 0.82,
  dueAt: NOW,
  lastReviewedAt: NOW,
  reviewCount: 1,
  lapseCount: 0,
  lastRating: "good",
  fsrsState: 2,
  ...over,
});

const baseReviewEvent: ReviewEvent = {
  id: "rev-1",
  attemptId: "att-1",
  userId: "user-001",
  knowledgePointId: "kp-1",
  rating: "good",
  reviewedAt: NOW,
  previousState: snapshot(),
  nextState: snapshot({ reviewCount: 2, stability: 4.5 }),
};

describe("createImmutableAttempt —— 事实记录不可变（BR-003）", () => {
  it("产出对象被 Object.freeze 冻结", () => {
    const attempt = createImmutableAttempt(baseAttempt);
    expect(Object.isFrozen(attempt)).toBe(true);
  });

  it("运行时对 status 等公开字段赋值不会生效（冻结对象写忽略）", () => {
    const attempt = createImmutableAttempt(baseAttempt);
    const before = attempt.status;
    // 非严格模式静默失败；严格模式抛 TypeError。两种语义下都要求原值保持。
    try {
      (attempt as { status: string }).status = "reviewed";
    } catch {
      // 严格模式下赋值直接抛错，也符合预期
    }
    expect(attempt.status).toBe(before);
    expect(attempt.status).toBe("submitted");
  });

  it("userAnswer 等事实字段同样不可被事后改写", () => {
    const attempt = createImmutableAttempt(baseAttempt);
    try {
      (attempt as { userAnswer: string }).userAnswer = "被篡改的答案";
    } catch {
      /* 严格模式抛错 */
    }
    expect(attempt.userAnswer).toBe("麻黄、桂枝");
  });
});

describe("createImmutableReviewEvent —— 评级事实与快照不可变（BR-034）", () => {
  it("事件本体被冻结", () => {
    const ev = createImmutableReviewEvent(baseReviewEvent);
    expect(Object.isFrozen(ev)).toBe(true);
  });

  it("前后两个状态快照同样被冻结（审计快照不被改写）", () => {
    const ev = createImmutableReviewEvent(baseReviewEvent);
    expect(Object.isFrozen(ev.previousState)).toBe(true);
    expect(Object.isFrozen(ev.nextState)).toBe(true);
  });

  it("运行时改写 rating / 快照字段均不生效", () => {
    const ev = createImmutableReviewEvent(baseReviewEvent);
    try {
      (ev as { rating: string }).rating = "again";
      (ev.nextState as { reviewCount: number }).reviewCount = 999;
    } catch {
      /* 严格模式抛错 */
    }
    expect(ev.rating).toBe("good");
    expect(ev.nextState.reviewCount).toBe(2);
  });
});

describe("LearningStateFromDraft —— 单一构造器（BR-040）", () => {
  const draft: LearningStateDraft = {
    stability: 4.5,
    difficulty: 5.0,
    retrievability: 0.9,
    dueAt: NOW,
    lastReviewedAt: NOW,
    reviewCount: 2,
    lapseCount: 0,
    lastRating: "good",
    fsrsState: 2,
  };

  it("把 draft + 归属/审计字段组装成完整 LearningState（14 个字段齐全）", () => {
    const state: LearningState = LearningStateFromDraft({
      userId: "user-001",
      knowledgePointId: "kp-1",
      draft,
      id: "ls-1",
      createdAt: NOW,
    });
    expect(state.id).toBe("ls-1");
    expect(state.userId).toBe("user-001");
    expect(state.knowledgePointId).toBe("kp-1");
    expect(state.stability).toBe(draft.stability);
    expect(state.difficulty).toBe(draft.difficulty);
    expect(state.retrievability).toBe(draft.retrievability);
    expect(state.dueAt).toBe(draft.dueAt);
    expect(state.lastReviewedAt).toBe(draft.lastReviewedAt);
    expect(state.reviewCount).toBe(draft.reviewCount);
    expect(state.lapseCount).toBe(draft.lapseCount);
    expect(state.lastRating).toBe(draft.lastRating);
    expect(state.fsrsState).toBe(draft.fsrsState);
    expect(state.createdAt).toBe(NOW);
    // 缺省 updatedAt 取 createdAt（首次创建）
    expect(state.updatedAt).toBe(NOW);
  });

  it("传入 updatedAt 时使用该值（更新既有状态）", () => {
    const later = new Date("2026-09-19T10:00:00.000Z");
    const state = LearningStateFromDraft({
      userId: "u",
      knowledgePointId: "k",
      draft,
      id: "ls-2",
      createdAt: NOW,
      updatedAt: later,
    });
    expect(state.createdAt).toBe(NOW);
    expect(state.updatedAt).toBe(later);
  });

  it("userId 为空 → 抛 ValidationError（UNIQUE(userId, knowledgePointId) 保护）", () => {
    expect(() =>
      LearningStateFromDraft({ userId: "", knowledgePointId: "kp-1", draft, id: "x", createdAt: NOW })
    ).toThrow(ValidationError);
  });

  it("knowledgePointId 为空 → 抛 ValidationError", () => {
    expect(() =>
      LearningStateFromDraft({ userId: "u", knowledgePointId: "", draft, id: "x", createdAt: NOW })
    ).toThrow(ValidationError);
  });
});

describe("canTransitionAttempt —— 线性状态机守卫（BR-013）", () => {
  it("submitted → evaluated 合法", () => {
    expect(canTransitionAttempt("submitted", "evaluated")).toBe(true);
  });

  it("evaluated → reviewed 合法", () => {
    expect(canTransitionAttempt("evaluated", "reviewed")).toBe(true);
  });

  it("reviewed 为终态，不允许自环 reviewed → reviewed", () => {
    expect(canTransitionAttempt("reviewed", "reviewed")).toBe(false);
  });

  it("禁止跳步 submitted → reviewed", () => {
    expect(canTransitionAttempt("submitted", "reviewed")).toBe(false);
  });
});
