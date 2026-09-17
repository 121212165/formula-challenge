/**
 * Governance 领域 —— 内容可信度的守护者。
 * 用户报告产生 Issue → 审核 → 修订草稿 → ContentVersion → 发布（架构文档 §32）。
 * Issue 永不直接修改 canonical 数据（BR-082）。
 */

export type ContentIssueType = "incorrect" | "missing" | "unclear" | "source" | "other";
export type ContentIssueStatus = "pending" | "reviewing" | "accepted" | "rejected";

export interface ContentIssue {
  id: string;
  reporterId: string;
  contentItemId: string;
  knowledgePointId: string | null;
  type: ContentIssueType;
  description: string;
  status: ContentIssueStatus;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}
