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

/**
 * ContentIssue 状态机（Phase 12 / 架构文档 §32，BR-082）。
 *
 * 合法路径（严格线性，禁止跳变）：
 *   pending → reviewing → accepted
 *                       → rejected
 *
 * - pending 不能直接 accepted/rejected（必须先进入 reviewing 标记审核中）；
 * - accepted / rejected 为终态，不可再迁移；
 * - reviewing 可被驳回（rejected）或通过（accepted）。
 *
 * 与 canTransitionContent 同款白名单写法；非法迁移由用例抛
 * InvalidStateTransitionError（HTTP 层映射 409）。
 */
export function canTransitionIssue(
  from: ContentIssueStatus,
  to: ContentIssueStatus
): boolean {
  const legal: Record<ContentIssueStatus, ContentIssueStatus[]> = {
    pending: ["reviewing"],
    reviewing: ["accepted", "rejected"],
    accepted: [],
    rejected: [],
  };
  return legal[from]?.includes(to) ?? false;
}

/** ContentIssueType 取值白名单（HTTP 层校验用）。 */
export const CONTENT_ISSUE_TYPES: readonly ContentIssueType[] = [
  "incorrect",
  "missing",
  "unclear",
  "source",
  "other",
];
