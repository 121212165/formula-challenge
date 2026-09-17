/**
 * Knowledge 领域 —— 回答"什么可以被独立记忆"。
 * KnowledgePoint 是记忆调度的最小单元，不是整个 ContentItem。
 */

import type { KnowledgePointType } from "@/shared/types/knowledge-point-type";

export type KnowledgePointStatus = "draft" | "published" | "archived";

export interface KnowledgePoint {
  id: string;
  contentItemId: string;
  /** 稳定编码，如 "mahuangtang.ingredients" */
  code: string;
  type: KnowledgePointType;
  title: string;
  canonicalAnswer: string;
  explanation: string | null;
  difficulty: number;
  /** 重要度/权重（计划排序用） */
  weight: number;
  status: KnowledgePointStatus;
  sortOrder: number;
}
