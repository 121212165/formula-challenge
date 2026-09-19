/**
 * Prisma 生产仓储 —— Evaluation。
 *
 * 【关键映射坑】领域 Evaluation 不含 userId，但 schema Evaluation.userId 非空且关联 User。
 * save 时先按 attemptId 查 Attempt 取 userId（取不到抛 NotFoundError），再按 attemptId upsert：
 *  - create 带 userId；
 *  - update 只更新 score / isCorrect / confidence / feedback。
 * 一个 Attempt 最多一个 Evaluation（attemptId @unique）。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import { NotFoundError } from "@/shared/errors";
import type { Evaluation } from "../domain/evaluation";
import type { EvaluationRepository } from "../domain/repositories";

type Row = {
  id: string;
  attemptId: string;
  userId: string;
  score: number;
  isCorrect: boolean;
  confidence: number;
  feedback: string | null;
  createdAt: Date;
};

function toDomain(row: Row): Evaluation {
  return {
    id: row.id,
    attemptId: row.attemptId,
    score: row.score,
    isCorrect: row.isCorrect,
    confidence: row.confidence,
    feedback: row.feedback,
    createdAt: row.createdAt,
  };
}

export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByAttemptId(attemptId: string): Promise<Evaluation | null> {
    const row = await this.db.evaluation.findUnique({ where: { attemptId } });
    return row ? toDomain(row) : null;
  }

  async save(evaluation: Evaluation): Promise<void> {
    // 领域对象不含 userId，而表列非空：从 Attempt 反查。
    const attempt = await this.db.attempt.findUnique({
      where: { id: evaluation.attemptId },
      select: { userId: true },
    });
    if (!attempt) {
      throw new NotFoundError(`Attempt ${evaluation.attemptId} 不存在，无法保存 Evaluation`);
    }

    await this.db.evaluation.upsert({
      where: { attemptId: evaluation.attemptId },
      create: {
        id: evaluation.id,
        attemptId: evaluation.attemptId,
        userId: attempt.userId,
        score: evaluation.score,
        isCorrect: evaluation.isCorrect,
        confidence: evaluation.confidence,
        feedback: evaluation.feedback,
        createdAt: evaluation.createdAt,
      },
      update: {
        score: evaluation.score,
        isCorrect: evaluation.isCorrect,
        confidence: evaluation.confidence,
        feedback: evaluation.feedback,
      },
    });
  }
}
