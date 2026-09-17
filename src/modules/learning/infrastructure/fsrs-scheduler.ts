/**
 * FsrsScheduler —— Scheduler 接口的 ts-fsrs 适配器（架构文档 §19 / learning-model §10）。
 * Domain 只依赖 Scheduler 接口；本实现属于 infrastructure（模块内 infrastructure 层）。
 * 之后可替换为 AlternativeScheduler / ExperimentalScheduler 而不污染领域。
 */

import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { ReviewRating } from "@/shared/types/rating";
import type { Scheduler } from "../domain/scheduler";
import type { LearningStateDraft } from "../domain/learning-state";

const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function toFsrsRating(rating: ReviewRating): Grade {
  return RATING_MAP[rating];
}

/** 首次（无历史）时构造 FSRS 空卡片；否则从 draft 还原卡片 */
function draftToCard(draft: LearningStateDraft, now: Date): Card {
  if (draft.reviewCount === 0 || draft.stability === 0) {
    return createEmptyCard(now);
  }
  return {
    due: draft.dueAt,
    stability: draft.stability,
    difficulty: draft.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: draft.reviewCount,
    lapses: draft.lapseCount,
    state: State.Review,
    last_review: draft.lastReviewedAt ?? draft.dueAt,
  };
}

export class FsrsScheduler implements Scheduler {
  private readonly f = fsrs();

  initialize(now: Date): LearningStateDraft {
    const card = createEmptyCard(now);
    return {
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability: 1,
      dueAt: card.due,
      lastReviewedAt: null,
      reviewCount: card.reps,
      lapseCount: card.lapses,
      lastRating: null,
    };
  }

  review(
    previous: LearningStateDraft,
    rating: ReviewRating,
    now: Date
  ): LearningStateDraft {
    const card = draftToCard(previous, now);
    const { card: nextCard } = this.f.next(card, now, toFsrsRating(rating));
    const retrievability = Number(this.f.get_retrievability(nextCard, now, false));

    return {
      stability: nextCard.stability,
      difficulty: nextCard.difficulty,
      retrievability: Number.isFinite(retrievability) ? retrievability : 1,
      dueAt: nextCard.due,
      lastReviewedAt: now,
      reviewCount: nextCard.reps,
      lapseCount: nextCard.lapses,
      lastRating: rating,
    };
  }
}
