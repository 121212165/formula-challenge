/**
 * Prisma 生产仓储 —— Attempt。
 *
 * 模式与 prisma-learning-state-repository.ts 一致：
 *  - 构造注入根 PrismaClient；每个方法用 getClient(this.prisma) 取当前客户端（事务内自动切 tx）。
 *  - 行 ↔ 领域映射集中在 toDomain。
 *  - Attempt 是不可变事实记录（BR-003），save 用 create；
 *    @@unique([userId, clientRequestId]) 冲突（P2002）由上层用例捕获并映射为幂等结果，这里不吞错。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { Attempt, AttemptStatus } from "../domain/attempt";
import type { AttemptRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  sessionId: string;
  sessionItemId: string;
  questionInstanceId: string;
  knowledgePointId: string;
  userAnswer: string;
  startedAt: Date;
  submittedAt: Date;
  timeSpentSeconds: number;
  status: AttemptStatus;
  clientRequestId: string;
};

function toDomain(row: Row): Attempt {
  return {
    id: row.id,
    userId: row.userId,
    sessionId: row.sessionId,
    sessionItemId: row.sessionItemId,
    questionInstanceId: row.questionInstanceId,
    knowledgePointId: row.knowledgePointId,
    userAnswer: row.userAnswer,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    timeSpentSeconds: row.timeSpentSeconds,
    status: row.status,
    clientRequestId: row.clientRequestId,
  };
}

export class PrismaAttemptRepository implements AttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<Attempt | null> {
    const row = await this.db.attempt.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByClientRequestId(userId: string, clientRequestId: string): Promise<Attempt | null> {
    const row = await this.db.attempt.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId } },
    });
    return row ? toDomain(row) : null;
  }

  async save(attempt: Attempt): Promise<void> {
    // 不可变事实记录：直接 create。重复 clientRequestId 触发 P2002，由上层处理（BR-012）。
    await this.db.attempt.create({
      data: {
        id: attempt.id,
        userId: attempt.userId,
        sessionId: attempt.sessionId,
        sessionItemId: attempt.sessionItemId,
        questionInstanceId: attempt.questionInstanceId,
        knowledgePointId: attempt.knowledgePointId,
        userAnswer: attempt.userAnswer,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        timeSpentSeconds: attempt.timeSpentSeconds,
        status: attempt.status,
        clientRequestId: attempt.clientRequestId,
      },
    });
  }

  async updateStatus(id: string, status: AttemptStatus): Promise<void> {
    await this.db.attempt.update({ where: { id }, data: { status } });
  }
}
