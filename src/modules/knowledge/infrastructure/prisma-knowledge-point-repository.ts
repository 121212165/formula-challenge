/**
 * Prisma 生产仓储 —— KnowledgePoint。
 * 模式样板见 learning 模块 prisma-learning-state-repository.ts。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { KnowledgePoint } from "../domain/knowledge-point";
import type { KnowledgePointStatus } from "../domain/knowledge-point";
import type { KnowledgePointRepository } from "../domain/knowledge-point-repository";

type Row = {
  id: string;
  contentItemId: string;
  code: string;
  type: KnowledgePoint["type"];
  title: string;
  canonicalAnswer: string;
  explanation: string | null;
  difficulty: number;
  weight: number;
  status: KnowledgePointStatus;
  sortOrder: number;
};

function toDomain(row: Omit<Row, "type"> & { type: string }): KnowledgePoint {
  return {
    id: row.id,
    contentItemId: row.contentItemId,
    code: row.code,
    type: row.type as KnowledgePoint["type"],
    title: row.title,
    canonicalAnswer: row.canonicalAnswer,
    explanation: row.explanation,
    difficulty: row.difficulty,
    weight: row.weight,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

export class PrismaKnowledgePointRepository implements KnowledgePointRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<KnowledgePoint | null> {
    const row = await this.db.knowledgePoint.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findPublishedById(id: string): Promise<KnowledgePoint | null> {
    // 用户只能看到 published（架构文档 §38）。
    const row = await this.db.knowledgePoint.findFirst({
      where: { id, status: "published" },
    });
    return row ? toDomain(row) : null;
  }

  async findPublishedByContentItem(contentItemId: string): Promise<KnowledgePoint[]> {
    const rows = await this.db.knowledgePoint.findMany({
      where: { contentItemId, status: "published" },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toDomain);
  }

  async countPublishedBySubject(subjectId: string): Promise<number> {
    // KnowledgePoint → ContentItem → Subject；只统计 published 的知识点。
    return this.db.knowledgePoint.count({
      where: { status: "published", contentItem: { subjectId } },
    });
  }

  async listPublishedBySubject(subjectId: string): Promise<KnowledgePoint[]> {
    // Phase 9 计划器"新知识自发现"候选：该科目下全部 published 知识点。
    // 排序：重要度 weight 降序 → sortOrder 升序（use case 再按此切 maxNew 预算）。
    const rows = await this.db.knowledgePoint.findMany({
      where: { status: "published", contentItem: { subjectId } },
      orderBy: [{ weight: "desc" }, { sortOrder: "asc" }],
    });
    return rows.map(toDomain);
  }

  async save(kp: KnowledgePoint): Promise<void> {
    await this.db.knowledgePoint.upsert({
      where: { id: kp.id },
      create: {
        id: kp.id,
        contentItemId: kp.contentItemId,
        code: kp.code,
        type: kp.type,
        title: kp.title,
        canonicalAnswer: kp.canonicalAnswer,
        explanation: kp.explanation,
        difficulty: kp.difficulty,
        weight: kp.weight,
        status: kp.status,
        sortOrder: kp.sortOrder,
      },
      update: {
        contentItemId: kp.contentItemId,
        code: kp.code,
        type: kp.type,
        title: kp.title,
        canonicalAnswer: kp.canonicalAnswer,
        explanation: kp.explanation,
        difficulty: kp.difficulty,
        weight: kp.weight,
        status: kp.status,
        sortOrder: kp.sortOrder,
      },
    });
  }
}
