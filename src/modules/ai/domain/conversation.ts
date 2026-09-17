/**
 * AI 领域 —— 会话与消息是一等记录，禁止 messages = "[]" 一整列塞 JSON（BR-102）。
 * AI 是咨询角色，不掌控学习状态与 canonical 内容（BR-100 / BR-101）。
 */

export interface AiConversation {
  id: string;
  userId: string;
  subjectId: string | null;
  knowledgePointId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AiMessageRole = "system" | "user" | "assistant";

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  model: string | null;
  tokenCount: number | null;
  createdAt: Date;
}
