/**
 * Governance 仓库接口（架构文档 §32，BR-082）。
 * Issue 永不直接修改 canonical 数据，只产生待审记录。
 * Domain 不直接碰 Prisma；实现类在 infrastructure 层。
 */

import type { ContentIssue, ContentIssueStatus } from "./content-issue";

export interface ContentIssueRepository {
  findById(id: string): Promise<ContentIssue | null>;
  /** 某内容下的全部问题报告 */
  findByContentItem(contentItemId: string): Promise<ContentIssue[]>;
  /** 按状态筛选（审核工作台用） */
  findByStatus(status: ContentIssueStatus): Promise<ContentIssue[]>;
  save(issue: ContentIssue): Promise<void>;
}

/** Governance 域所需的全部仓库 */
export interface GovernanceRepositories {
  contentIssues: ContentIssueRepository;
}
