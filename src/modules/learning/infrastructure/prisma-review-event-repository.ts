/**
 * Prisma 生产仓储 —— ReviewEvent。
 *
 * previousState / nextState 是 schema 的 Json 列，领域里是 ReviewStateSnapshot
 * （含 Date 型 dueAt / lastReviewedAt）。
 *  - 写库：把 dueAt / lastReviewedAt 序列化为 ISO 字符串存进 JSON 对象；其余 number/string 原样。
 *  - 读库：把 dueAt / lastReviewedAt 还原成 Date（lastReviewedAt 可能为 null）。
 * reviewedAt 是独立 DateTime 列。
 * 一个 Attempt 最多一个 ReviewEvent（attemptId @unique，BR-030）。
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ReviewRating } from "@/shared/types/rating";
import type { ReviewEvent, ReviewStateSnapshot } from "../domain/review-event";
import type { ReviewEventRepository } from "../domain/repositories";

/** 落库的 JSON 形状：Date 字段被序列化成 ISO 字符串。 */
type StoredSnapshot = {
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  lastRating: ReviewRating | null;
  fsrsState: number;
};

type Row = {
  id: string;
  attemptId: string;
  userId: string;
  knowledgePointId: string;
  rating: ReviewRating;
  reviewedAt: Date;
  previousState: Prisma.JsonValue;
  nextState: Prisma.JsonValue;
};

function serializeSnapshot(snapshot: ReviewStateSnapshot): StoredSnapshot {
  return {
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    retrievability: snapshot.retrievability,
    dueAt: snapshot.dueAt.toISOString(),
    lastReviewedAt: snapshot.lastReviewedAt ? snapshot.lastReviewedAt.toISOString() : null,
    reviewCount: snapshot.reviewCount,
    lapseCount: snapshot.lapseCount,
    lastRating: snapshot.lastRating,
    fsrsState: snapshot.fsrsState,
  };
}

function deserializeSnapshot(stored: StoredSnapshot): ReviewStateSnapshot {
  return {
    stability: stored.stability,
    difficulty: stored.difficulty,
    retrievability: stored.retrievability,
    dueAt: new Date(stored.dueAt),
    lastReviewedAt: stored.lastReviewedAt == null ? null : new Date(stored.lastReviewedAt),
    reviewCount: stored.reviewCount,
    lapseCount: stored.lapseCount,
    lastRating: stored.lastRating,
    fsrsState: stored.fsrsState,
  };
}

function toDomain(row: Row): ReviewEvent {
  return {
    id: row.id,
    attemptId: row.attemptId,
    userId: row.userId,
    knowledgePointId: row.knowledgePointId,
    rating: row.rating,
    reviewedAt: row.reviewedAt,
    previousState: deserializeSnapshot(row.previousState as unknown as StoredSnapshot),
    nextState: deserializeSnapshot(row.nextState as unknown as StoredSnapshot),
  };
}

export class PrismaReviewEventRepository implements ReviewEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByAttemptId(attemptId: string): Promise<ReviewEvent | null> {
    const row = await this.db.reviewEvent.findUnique({ where: { attemptId } });
    return row ? toDomain(row) : null;
  }

  async findAllByUser(userId: string): Promise<ReviewEvent[]> {
    const rows = await this.db.reviewEvent.findMany({
      where: { userId },
      orderBy: { reviewedAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(reviewEvent: ReviewEvent): Promise<void> {
    // BR-030：一个 Attempt 最多一个 ReviewEvent；按 attemptId upsert 防止重复 finalize 触发 P2002。
    await this.db.reviewEvent.upsert({
      where: { attemptId: reviewEvent.attemptId },
      create: {
        id: reviewEvent.id,
        attemptId: reviewEvent.attemptId,
        userId: reviewEvent.userId,
        knowledgePointId: reviewEvent.knowledgePointId,
        rating: reviewEvent.rating,
        reviewedAt: reviewEvent.reviewedAt,
        previousState: serializeSnapshot(reviewEvent.previousState),
        nextState: serializeSnapshot(reviewEvent.nextState),
      },
      update: {
        rating: reviewEvent.rating,
        reviewedAt: reviewEvent.reviewedAt,
        previousState: serializeSnapshot(reviewEvent.previousState),
        nextState: serializeSnapshot(reviewEvent.nextState),
      },
    });
  }
}
