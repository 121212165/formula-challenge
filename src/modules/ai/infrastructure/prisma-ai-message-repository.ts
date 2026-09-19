/**
 * Prisma 生产仓储 —— AiMessage。
 * 消息是一等记录（BR-102）；save 按 id upsert。
 * findByConversation 按 createdAt 正序返回某会话全部消息。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { AiMessage } from "../domain/conversation";
import type { AiMessageRepository } from "../domain/repositories";

type Row = {
  id: string;
  conversationId: string;
  role: AiMessage["role"];
  content: string;
  model: string | null;
  tokenCount: number | null;
  createdAt: Date;
};

function toDomain(row: Row): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    model: row.model,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
  };
}

export class PrismaAiMessageRepository implements AiMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<AiMessage | null> {
    const row = await this.db.aiMessage.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByConversation(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.db.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(message: AiMessage): Promise<void> {
    await this.db.aiMessage.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        model: message.model,
        tokenCount: message.tokenCount,
        createdAt: message.createdAt,
      },
      update: {
        role: message.role,
        content: message.content,
        model: message.model,
        tokenCount: message.tokenCount,
      },
    });
  }
}
