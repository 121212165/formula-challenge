/**
 * Prisma 生产仓储 —— AiConversation。
 * 会话是一等记录（BR-102）；save 按 id upsert。
 * findByUser 按 createdAt 倒序、take limit 取最近会话。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { AiConversation } from "../domain/conversation";
import type { AiConversationRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  subjectId: string | null;
  knowledgePointId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): AiConversation {
  return {
    id: row.id,
    userId: row.userId,
    subjectId: row.subjectId,
    knowledgePointId: row.knowledgePointId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaAiConversationRepository implements AiConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<AiConversation | null> {
    const row = await this.db.aiConversation.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByUser(userId: string, limit: number): Promise<AiConversation[]> {
    const rows = await this.db.aiConversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async save(conversation: AiConversation): Promise<void> {
    await this.db.aiConversation.upsert({
      where: { id: conversation.id },
      create: {
        id: conversation.id,
        userId: conversation.userId,
        subjectId: conversation.subjectId,
        knowledgePointId: conversation.knowledgePointId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      update: {
        subjectId: conversation.subjectId,
        knowledgePointId: conversation.knowledgePointId,
        updatedAt: conversation.updatedAt,
      },
    });
  }
}
