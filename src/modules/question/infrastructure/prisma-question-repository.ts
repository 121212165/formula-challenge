/**
 * Prisma 生产仓储 —— QuestionTemplate / QuestionInstance。
 * 模式样板见 learning 模块 prisma-learning-state-repository.ts。
 * QuestionTemplate.config 在 DB 是 Json?，领域是 unknown，直接透传。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { QuestionInstance, QuestionTemplate, QuestionType } from "../domain/question";
import type { QuestionRepository } from "../domain/question-repository";

type TemplateRow = {
  id: string;
  knowledgePointType: QuestionTemplate["knowledgePointType"];
  type: QuestionType;
  difficulty: number;
  config: unknown;
  enabled: boolean;
};

function templateToDomain(
  row: Omit<TemplateRow, "knowledgePointType"> & { knowledgePointType: string },
): QuestionTemplate {
  return {
    id: row.id,
    knowledgePointType: row.knowledgePointType as QuestionTemplate["knowledgePointType"],
    type: row.type,
    difficulty: row.difficulty,
    config: row.config,
    enabled: row.enabled,
  };
}

type InstanceRow = {
  id: string;
  sessionItemId: string;
  knowledgePointId: string;
  templateId: string;
  sequence: number;
  generatedAt: Date;
};

function instanceToDomain(row: InstanceRow): QuestionInstance {
  return {
    id: row.id,
    sessionItemId: row.sessionItemId,
    knowledgePointId: row.knowledgePointId,
    templateId: row.templateId,
    sequence: row.sequence,
    generatedAt: row.generatedAt,
  };
}

export class PrismaQuestionRepository implements QuestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findTemplateById(id: string): Promise<QuestionTemplate | null> {
    const row = await this.db.questionTemplate.findUnique({ where: { id } });
    return row ? templateToDomain(row) : null;
  }

  async findTemplate(
    knowledgePointType: string,
    type: QuestionTemplate["type"],
  ): Promise<QuestionTemplate | null> {
    // QuestionTemplate 有 @@unique([knowledgePointType, type])。
    const row = await this.db.questionTemplate.findUnique({
      where: { knowledgePointType_type: { knowledgePointType, type } },
    });
    return row ? templateToDomain(row) : null;
  }

  async findInstanceById(id: string): Promise<QuestionInstance | null> {
    const row = await this.db.questionInstance.findUnique({ where: { id } });
    return row ? instanceToDomain(row) : null;
  }

  async countInstancesBySessionItem(sessionItemId: string): Promise<number> {
    return this.db.questionInstance.count({ where: { sessionItemId } });
  }

  async saveInstance(instance: QuestionInstance): Promise<void> {
    await this.db.questionInstance.upsert({
      where: { id: instance.id },
      create: {
        id: instance.id,
        sessionItemId: instance.sessionItemId,
        knowledgePointId: instance.knowledgePointId,
        templateId: instance.templateId,
        sequence: instance.sequence,
        generatedAt: instance.generatedAt,
      },
      update: {
        sessionItemId: instance.sessionItemId,
        knowledgePointId: instance.knowledgePointId,
        templateId: instance.templateId,
        sequence: instance.sequence,
        generatedAt: instance.generatedAt,
      },
    });
  }
}
