/**
 * Question 领域 —— 回答"如何对知识点做记忆测验"。
 * Question 不是 Content：模板描述方式，实例描述一次具体提问。
 */

import type { KnowledgePointType } from "@/shared/types/knowledge-point-type";

export type QuestionType = "free_recall" | "fill_blank" | "recognition" | "ordering";

export interface QuestionTemplate {
  id: string;
  knowledgePointType: KnowledgePointType;
  type: QuestionType;
  difficulty: number;
  /** 模板参数（题型专属），可 JSON 存储（架构文档 §44 允许） */
  config: unknown;
  enabled: boolean;
}

export interface QuestionInstance {
  id: string;
  sessionItemId: string;
  knowledgePointId: string;
  templateId: string;
  sequence: number;
  generatedAt: Date;
}
