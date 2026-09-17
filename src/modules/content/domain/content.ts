/**
 * Content 领域 —— 回答"存在哪些知识"。
 * 通用内容模型：Subject → SubjectCategory → ContentItem → 专业扩展。
 */

import type { SubjectCode } from "@/shared/types/knowledge-point-type";

export interface Subject {
  id: string;
  /** formula | herb | acupoint（未来可扩展） */
  code: SubjectCode;
  name: string;
  description: string;
  enabled: boolean;
}

export interface SubjectCategory {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  sortOrder: number;
}

export type ContentItemStatus = "draft" | "review" | "published" | "archived";

export interface ContentItem {
  id: string;
  subjectId: string;
  categoryId: string | null;
  slug: string;
  name: string;
  status: ContentItemStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 用户只能看到 published（架构文档 §38） */
export function isContentVisible(status: ContentItemStatus): boolean {
  return status === "published";
}
