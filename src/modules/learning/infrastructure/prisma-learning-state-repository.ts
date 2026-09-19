/**
 * Prisma 生产仓储参考实现 —— LearningState。
 *
 * 这是 Phase 3 仓储实现的【模式样板】：
 *  - 构造注入根 PrismaClient；每个方法用 getClient(this.prisma) 取当前客户端
 *    （事务内自动切到 tx，见 prisma-tx-context.ts）。
 *  - 行 → 领域对象 / 领域对象 → 行 的映射集中在 toDomain / toRow。
 *  - 唯一约束冲突（P2002）由调用方/用例映射为 ConflictError；这里不吞错。
 *  - Domain 层零 import @prisma/client；本文件在 infrastructure 层，可自由使用。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ReviewRating } from "@/shared/types/rating";
import type { LearningState } from "../domain/learning-state";
import type { LearningStateRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  knowledgePointId: string;
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lapseCount: number;
  lastRating: ReviewRating | null;
  fsrsState: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): LearningState {
  return {
    id: row.id,
    userId: row.userId,
    knowledgePointId: row.knowledgePointId,
    stability: row.stability,
    difficulty: row.difficulty,
    retrievability: row.retrievability,
    dueAt: row.dueAt,
    lastReviewedAt: row.lastReviewedAt,
    reviewCount: row.reviewCount,
    lapseCount: row.lapseCount,
    lastRating: row.lastRating,
    fsrsState: row.fsrsState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaLearningStateRepository implements LearningStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async find(userId: string, knowledgePointId: string): Promise<LearningState | null> {
    const row = await this.db.learningState.findUnique({
      where: { userId_knowledgePointId: { userId, knowledgePointId } },
    });
    return row ? toDomain(row) : null;
  }

  async save(state: LearningState): Promise<void> {
    // upsert 满足 BR-040 UNIQUE(userId, knowledgePointId)：首次 insert，后续按同一键 update。
    await this.db.learningState.upsert({
      where: { userId_knowledgePointId: { userId: state.userId, knowledgePointId: state.knowledgePointId } },
      create: {
        id: state.id,
        userId: state.userId,
        knowledgePointId: state.knowledgePointId,
        stability: state.stability,
        difficulty: state.difficulty,
        retrievability: state.retrievability,
        dueAt: state.dueAt,
        lastReviewedAt: state.lastReviewedAt,
        reviewCount: state.reviewCount,
        lapseCount: state.lapseCount,
        lastRating: state.lastRating,
        fsrsState: state.fsrsState,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
      update: {
        stability: state.stability,
        difficulty: state.difficulty,
        retrievability: state.retrievability,
        dueAt: state.dueAt,
        lastReviewedAt: state.lastReviewedAt,
        reviewCount: state.reviewCount,
        lapseCount: state.lapseCount,
        lastRating: state.lastRating,
        fsrsState: state.fsrsState,
        updatedAt: state.updatedAt,
      },
    });
  }

  async findDue(userId: string, now: Date, limit: number): Promise<LearningState[]> {
    const rows = await this.db.learningState.findMany({
      where: { userId, dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async findAllByUser(userId: string): Promise<LearningState[]> {
    const rows = await this.db.learningState.findMany({
      where: { userId },
      orderBy: { updatedAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async countLearnedByUserAndSubject(userId: string, subjectId: string): Promise<number> {
    // LearningState → KnowledgePoint(published) → ContentItem → Subject。
    // 嵌套关系过滤：只统计该用户在该科目下、已发布知识点的 LearningState 数。
    return this.db.learningState.count({
      where: {
        userId,
        knowledgePoint: { status: "published", contentItem: { subjectId } },
      },
    });
  }
}
