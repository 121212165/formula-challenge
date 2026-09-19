/**
 * Prisma 生产仓储 —— ContentSource（BR-080 出处可追溯）。
 * 模式样板见 prisma-learning-state-repository.ts。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { ContentSource } from "../domain/source-version";
import type { ContentSourceRepository } from "../domain/repositories";

type Row = {
  id: string;
  title: string;
  edition: string | null;
  publisher: string | null;
  year: number | null;
  citation: string | null;
  createdAt: Date;
};

function toDomain(row: Row): ContentSource {
  return {
    id: row.id,
    title: row.title,
    edition: row.edition,
    publisher: row.publisher,
    year: row.year,
    citation: row.citation,
    createdAt: row.createdAt,
  };
}

export class PrismaContentSourceRepository implements ContentSourceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<ContentSource | null> {
    const row = await this.db.contentSource.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findAll(): Promise<ContentSource[]> {
    const rows = await this.db.contentSource.findMany({
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(source: ContentSource): Promise<void> {
    await this.db.contentSource.upsert({
      where: { id: source.id },
      create: {
        id: source.id,
        title: source.title,
        edition: source.edition,
        publisher: source.publisher,
        year: source.year,
        citation: source.citation,
        createdAt: source.createdAt,
      },
      update: {
        title: source.title,
        edition: source.edition,
        publisher: source.publisher,
        year: source.year,
        citation: source.citation,
      },
    });
  }
}
