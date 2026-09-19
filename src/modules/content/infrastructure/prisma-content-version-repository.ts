/**
 * Prisma 生产仓储 —— ContentVersion（BR-081 修订留痕）。
 * 模式样板见 prisma-learning-state-repository.ts。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ContentVersion } from "../domain/source-version";
import type { ContentVersionRepository } from "../domain/repositories";

type Row = {
  id: string;
  contentItemId: string;
  version: number;
  sourceId: string | null;
  contentHash: string;
  createdBy: string | null;
  createdAt: Date;
};

function toDomain(row: Row): ContentVersion {
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    version: row.version,
    sourceId: row.sourceId,
    contentHash: row.contentHash,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export class PrismaContentVersionRepository implements ContentVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<ContentVersion | null> {
    const row = await this.db.contentVersion.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByContentItem(contentItemId: string): Promise<ContentVersion[]> {
    const rows = await this.db.contentVersion.findMany({
      where: { contentItemId },
      orderBy: { version: "asc" },
    });
    return rows.map(toDomain);
  }

  async findLatest(contentItemId: string): Promise<ContentVersion | null> {
    // 该内容当前最新版本：version 最大者，用于版本号自增。
    const row = await this.db.contentVersion.findFirst({
      where: { contentItemId },
      orderBy: { version: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  async save(version: ContentVersion): Promise<void> {
    await this.db.contentVersion.upsert({
      where: { id: version.id },
      create: {
        id: version.id,
        contentItemId: version.contentItemId,
        version: version.version,
        sourceId: version.sourceId,
        contentHash: version.contentHash,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      },
      update: {
        contentItemId: version.contentItemId,
        version: version.version,
        sourceId: version.sourceId,
        contentHash: version.contentHash,
        createdBy: version.createdBy,
      },
    });
  }
}
