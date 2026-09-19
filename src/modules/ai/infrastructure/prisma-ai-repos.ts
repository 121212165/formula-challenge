/**
 * AI 模块 Prisma 仓储组装工厂。
 */
import type { PrismaClient } from "@prisma/client";
import type { AiRepositories } from "../domain/repositories";
import { PrismaAiConversationRepository } from "./prisma-ai-conversation-repository";
import { PrismaAiMessageRepository } from "./prisma-ai-message-repository";

export function createPrismaAiRepos(prisma: PrismaClient): AiRepositories {
  return {
    conversations: new PrismaAiConversationRepository(prisma),
    messages: new PrismaAiMessageRepository(prisma),
  };
}
