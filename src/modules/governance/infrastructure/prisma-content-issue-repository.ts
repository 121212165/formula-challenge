/**
 * Prisma 生产仓储 —— ContentIssue。
 * Issue 只产生待审记录，永不直接改 canonical 数据（BR-082）；save 按 id upsert。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ContentIssue, ContentIssueStatus } from "../domain/content-issue";
import type { ContentIssueRepository } from "../domain/repositories";

type Row = {
  id: string;
  reporterId: string;
  contentItemId: string;
  knowledgePointId: string | null;
  type: ContentIssue["type"];
  description: string;
  status: ContentIssueStatus;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): ContentIssue {
  return {
    id: row.id,
    reporterId: row.reporterId,
    contentItemId: row.contentItemId,
    knowledgePointId: row.knowledgePointId,
    type: row.type,
    description: row.description,
    status: row.status,
    reviewerId: row.reviewerId,
    resolution: row.resolution,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaContentIssueRepository implements ContentIssueRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<ContentIssue | null> {
    const row = await this.db.contentIssue.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByContentItem(contentItemId: string): Promise<ContentIssue[]> {
    const rows = await this.db.contentIssue.findMany({
      where: { contentItemId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findByStatus(status: ContentIssueStatus): Promise<ContentIssue[]> {
    const rows = await this.db.contentIssue.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async save(issue: ContentIssue): Promise<void> {
    await this.db.contentIssue.upsert({
      where: { id: issue.id },
      create: {
        id: issue.id,
        reporterId: issue.reporterId,
        contentItemId: issue.contentItemId,
        knowledgePointId: issue.knowledgePointId,
        type: issue.type,
        description: issue.description,
        status: issue.status,
        reviewerId: issue.reviewerId,
        resolution: issue.resolution,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      },
      update: {
        type: issue.type,
        description: issue.description,
        status: issue.status,
        reviewerId: issue.reviewerId,
        resolution: issue.resolution,
        updatedAt: issue.updatedAt,
      },
    });
  }
}
