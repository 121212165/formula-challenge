/**
 * FinalizeReview Use Case —— 学习核心事务（架构文档 §20 / §43，BR-033）。
 *
 * 输入：attemptId + rating
 * 规则：
 *   1. Attempt 必须存在
 *   2. Attempt 必须已 evaluated（BR-013：reviewed 前必须 evaluated）
 *   3. 一个 Attempt 最多一个 ReviewEvent（BR-030，数据库 UNIQUE(attemptId) 兜底）
 *   4. LearningState 不存在时显式初始化（BR-042）
 *   5. Scheduler 计算 nextState（BR-032）
 *   6. ReviewEvent 与 LearningState 在同一事务（BR-033）
 *   7. 重复请求幂等返回已有结果，不重复调度（BR-034）
 *
 * 事务内同时更新：SessionItem → completed、StudyDay 累计（文档 §20）。
 */

import type { ReviewRating } from "@/shared/types/rating";
import {
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { LearningRepositories } from "../domain/repositories";
import type { Scheduler } from "../domain/scheduler";
import type { LearningState, LearningStateDraft } from "../domain/learning-state";
import type { ReviewEvent, ReviewStateSnapshot } from "../domain/review-event";

export interface FinalizeReviewDeps {
  repos: LearningRepositories;
  uow: UnitOfWork;
  scheduler: Scheduler;
  /** 可注入 ID 生成器（测试用） */
  idGen?: () => string;
  /** 可注入时钟（测试用） */
  now?: () => Date;
  /** 按用户时区计算本地日期 "YYYY-MM-DD"（BR-061 / BR-093） */
  getLocalDate: (userId: string, now: Date) => Promise<string>;
}

export interface FinalizeReviewCommand {
  attemptId: string;
  rating: ReviewRating;
}

export interface FinalizeReviewResult {
  /** true = 新建 ReviewEvent；false = 幂等命中，返回已有结果 */
  created: boolean;
  reviewEvent: ReviewEvent;
  learningState: LearningState;
}

function toDraft(state: LearningState): LearningStateDraft {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    retrievability: state.retrievability,
    dueAt: state.dueAt,
    lastReviewedAt: state.lastReviewedAt,
    reviewCount: state.reviewCount,
    lapseCount: state.lapseCount,
    lastRating: state.lastRating,
  };
}

function toSnapshot(draft: LearningStateDraft): ReviewStateSnapshot {
  return {
    stability: draft.stability,
    difficulty: draft.difficulty,
    retrievability: draft.retrievability,
    dueAt: draft.dueAt,
    lastReviewedAt: draft.lastReviewedAt,
    reviewCount: draft.reviewCount,
    lapseCount: draft.lapseCount,
    lastRating: draft.lastRating,
  };
}

function randomId(): string {
  return crypto.randomUUID();
}

export class FinalizeReview {
  constructor(private readonly deps: FinalizeReviewDeps) {}

  async execute(cmd: FinalizeReviewCommand): Promise<FinalizeReviewResult> {
    const { repos, uow, scheduler } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const attempt = await repos.attempts.findById(cmd.attemptId);
      if (!attempt) {
        throw new NotFoundError(`Attempt ${cmd.attemptId} 不存在`);
      }

      // 幂等：同一 Attempt 重复提交 Review，直接返回已有结果（BR-034）
      const existingReview = await repos.reviewEvents.findByAttemptId(attempt.id);
      if (existingReview) {
        const existingState = await repos.learningStates.find(
          attempt.userId,
          attempt.knowledgePointId
        );
        if (!existingState) {
          throw new InvalidStateTransitionError("ReviewEvent 存在但 LearningState 缺失，数据不一致");
        }
        return {
          created: false,
          reviewEvent: existingReview,
          learningState: existingState,
        };
      }

      // 状态机：Attempt 必须已 evaluated 才能评级（BR-013）
      if (attempt.status !== "evaluated") {
        throw new InvalidStateTransitionError(
          `Attempt 当前状态 ${attempt.status}，必须 evaluated 后才能评级`
        );
      }

      const reviewedAt = now();

      // 取当前 LearningState；不存在则显式初始化（BR-042）
      const prevState = await repos.learningStates.find(
        attempt.userId,
        attempt.knowledgePointId
      );
      const previous: LearningStateDraft = prevState
        ? toDraft(prevState)
        : scheduler.initialize(reviewedAt);

      // Scheduler 计算 nextState（BR-032）
      const next: LearningStateDraft = scheduler.review(previous, cmd.rating, reviewedAt);

      // ReviewEvent（含前后快照）
      const reviewEvent: ReviewEvent = {
        id: idGen(),
        attemptId: attempt.id,
        userId: attempt.userId,
        knowledgePointId: attempt.knowledgePointId,
        rating: cmd.rating,
        reviewedAt,
        previousState: toSnapshot(previous),
        nextState: toSnapshot(next),
      };

      // LearningState 创建/更新（BR-040：UNIQUE(userId, knowledgePointId)）
      const learningState: LearningState = {
        id: prevState?.id ?? idGen(),
        userId: attempt.userId,
        knowledgePointId: attempt.knowledgePointId,
        stability: next.stability,
        difficulty: next.difficulty,
        retrievability: next.retrievability,
        dueAt: next.dueAt,
        lastReviewedAt: next.lastReviewedAt,
        reviewCount: next.reviewCount,
        lapseCount: next.lapseCount,
        lastRating: next.lastRating,
        createdAt: prevState?.createdAt ?? reviewedAt,
        updatedAt: reviewedAt,
      };

      await repos.reviewEvents.save(reviewEvent);
      await repos.learningStates.save(learningState);

      // Attempt 状态机：evaluated → reviewed（BR-013）
      await repos.attempts.updateStatus(attempt.id, "reviewed");

      // 更新 SessionItem → completed（如果存在且未完成）
      const sessionItem = await repos.sessionItems.findById(attempt.sessionItemId);
      if (sessionItem && sessionItem.status !== "completed" && sessionItem.status !== "skipped") {
        await repos.sessionItems.save({ ...sessionItem, status: "completed" });
      }

      // 更新 StudyDay（按用户时区）
      const localDate = await this.deps.getLocalDate(attempt.userId, reviewedAt);
      const day = await repos.studyDays.find(attempt.userId, localDate);
      await repos.studyDays.upsert({
        id: day?.id ?? idGen(),
        userId: attempt.userId,
        localDate,
        minutes: day?.minutes ?? 0,
        attemptCount: day ? day.attemptCount + 1 : 1,
        correctCount: day ? day.correctCount + (reviewEvent.rating === "again" ? 0 : 1) : 1,
        reviewCount: day ? day.reviewCount + 1 : 1,
        newCount: (day?.newCount ?? 0) + (prevState ? 0 : 1),
        completedSessionCount: day?.completedSessionCount ?? 0,
      });

      return { created: true, reviewEvent, learningState };
    });
  }
}
