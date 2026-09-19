/**
 * Prisma 生产仓储 —— ContentItem。
 *
 * 模式样板见 prisma-learning-state-repository.ts：
 *  - 构造注入根 PrismaClient；每个方法用 getClient(this.prisma) 取当前客户端（事务内自动切 tx）。
 *  - 行 → 领域对象映射集中在 toDomain。
 *  - 唯一约束冲突（P2002）不吞，交由用例映射为 ConflictError。
 *  - infrastructure 层可自由 import @prisma/client；domain 层严禁。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ContentItem, ContentItemStatus } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

type Row = {
  id: string;
  subjectId: string;
  categoryId: string | null;
  slug: string;
  name: string;
  status: ContentItemStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): ContentItem {
  return {
    id: row.id,
    subjectId: row.subjectId,
    categoryId: row.categoryId,
    slug: row.slug,
    name: row.name,
    status: row.status,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaContentItemRepository implements ContentItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<ContentItem | null> {
    const row = await this.db.contentItem.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(item: ContentItem): Promise<void> {
    await this.db.contentItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        subjectId: item.subjectId,
        categoryId: item.categoryId,
        slug: item.slug,
        name: item.name,
        status: item.status,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      update: {
        subjectId: item.subjectId,
        categoryId: item.categoryId,
        slug: item.slug,
        name: item.name,
        status: item.status,
        sortOrder: item.sortOrder,
        updatedAt: item.updatedAt,
      },
    });
  }

  async findBySlug(subjectId: string, slug: string): Promise<ContentItem | null> {
    // BR：ContentItem 有 @@unique([subjectId, slug])，路由按学科 + slug 定位。
    const row = await this.db.contentItem.findUnique({
      where: { subjectId_slug: { subjectId, slug } },
    });
    return row ? toDomain(row) : null;
  }

  async findByStatus(status: ContentItemStatus): Promise<ContentItem[]> {
    const rows = await this.db.contentItem.findMany({
      where: { status },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toDomain);
  }
}
