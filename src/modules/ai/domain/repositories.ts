/**
 * AI 仓库接口（架构文档 §33，BR-102）。
 * 会话与消息是一等记录，禁止把整段 messages 当 JSON 塞一列。
 * Domain 不直接碰 Prisma；实现类在 infrastructure 层。
 */

import type { AiConversation, AiMessage } from "./conversation";

export interface AiConversationRepository {
  findById(id: string): Promise<AiConversation | null>;
  /** 某用户最近的会话列表（按时间倒序，limit 控制数量） */
  findByUser(userId: string, limit: number): Promise<AiConversation[]>;
  save(conversation: AiConversation): Promise<void>;
}

export interface AiMessageRepository {
  findById(id: string): Promise<AiMessage | null>;
  /** 某会话的全部消息（按时间正序） */
  findByConversation(conversationId: string): Promise<AiMessage[]>;
  save(message: AiMessage): Promise<void>;
}

/** AI 域所需的全部仓库 */
export interface AiRepositories {
  conversations: AiConversationRepository;
  messages: AiMessageRepository;
}
