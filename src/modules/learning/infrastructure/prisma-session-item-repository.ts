/**
 * Prisma 生产仓储 —— SessionItem。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { SessionItem, SessionItemStatus } from "../domain/session";
import type { SessionItemRepository } from "../domain/repositories";

type Row = {
  id: string;
  sessionId: string;
  knowledgePointId: string;
  position: number;
  status: SessionItemStatus;
  questionInstanceId: string | null;
};

function toDomain(row: Row): SessionItem {
  return {
    id: row.id,
    sessionId: row.sessionId,
    knowledgePointId: row.knowledgePointId,
    position: row.position,
    status: row.status,
    questionInstanceId: row.questionInstanceId,
  };
}

export class PrismaSessionItemRepository implements SessionItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<SessionItem | null> {
    const row = await this.db.sessionItem.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findBySession(sessionId: string): Promise<SessionItem[]> {
    const rows = await this.db.sessionItem.findMany({
      where: { sessionId },
      orderBy: { position: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(item: SessionItem): Promise<void> {
    // SessionItem 会被状态机反复更新（pending→active→completed），
    // 按 id upsert：首次 insert，后续按同一 id update 状态。
    // （早先用裸 create 会在第二次写时撞 @@unique([sessionId, position])，真实库测试已暴露。）
    await this.db.sessionItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        sessionId: item.sessionId,
        knowledgePointId: item.knowledgePointId,
        position: item.position,
        status: item.status,
        questionInstanceId: item.questionInstanceId,
      },
      update: {
        status: item.status,
        questionInstanceId: item.questionInstanceId,
      },
    });
  }
}
