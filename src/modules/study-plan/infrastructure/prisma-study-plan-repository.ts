/**
 * Prisma 生产仓储 —— StudyPlan / StudyPlanItem（BR-060）。
 * 模式样板见 learning 模块 prisma-learning-state-repository.ts。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type {
  StudyPlan,
  StudyPlanItem,
  StudyPlanItemStatus,
  StudyPlanItemType,
  StudyPlanSource,
  StudyPlanStatus,
} from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

type PlanRow = {
  id: string;
  userId: string;
  localDate: string;
  source: StudyPlanSource;
  status: StudyPlanStatus;
};

function planToDomain(row: PlanRow): StudyPlan {
  return {
    id: row.id,
    userId: row.userId,
    localDate: row.localDate,
    source: row.source,
    status: row.status,
  };
}

type ItemRow = {
  id: string;
  planId: string;
  knowledgePointId: string;
  type: StudyPlanItemType;
  reason: string;
  position: number;
  status: StudyPlanItemStatus;
};

function itemToDomain(row: ItemRow): StudyPlanItem {
  return {
    id: row.id,
    planId: row.planId,
    knowledgePointId: row.knowledgePointId,
    type: row.type,
    reason: row.reason,
    position: row.position,
    status: row.status,
  };
}

export class PrismaStudyPlanRepository implements StudyPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<StudyPlan | null> {
    const row = await this.db.studyPlan.findUnique({ where: { id } });
    return row ? planToDomain(row) : null;
  }

  async findByLocalDate(userId: string, localDate: string): Promise<StudyPlan | null> {
    // StudyPlan 有 @@unique([userId, localDate])（BR-060）。
    const row = await this.db.studyPlan.findUnique({
      where: { userId_localDate: { userId, localDate } },
    });
    return row ? planToDomain(row) : null;
  }

  async findItemById(id: string): Promise<StudyPlanItem | null> {
    const row = await this.db.studyPlanItem.findUnique({ where: { id } });
    return row ? itemToDomain(row) : null;
  }

  async findItemsByPlan(planId: string): Promise<StudyPlanItem[]> {
    const rows = await this.db.studyPlanItem.findMany({
      where: { planId },
      orderBy: { position: "asc" },
    });
    return rows.map(itemToDomain);
  }

  async savePlan(plan: StudyPlan): Promise<void> {
    await this.db.studyPlan.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        userId: plan.userId,
        localDate: plan.localDate,
        source: plan.source,
        status: plan.status,
      },
      update: {
        userId: plan.userId,
        localDate: plan.localDate,
        source: plan.source,
        status: plan.status,
      },
    });
  }

  async saveItem(item: StudyPlanItem): Promise<void> {
    await this.db.studyPlanItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        planId: item.planId,
        knowledgePointId: item.knowledgePointId,
        type: item.type,
        reason: item.reason,
        position: item.position,
        status: item.status,
      },
      update: {
        planId: item.planId,
        knowledgePointId: item.knowledgePointId,
        type: item.type,
        reason: item.reason,
        position: item.position,
        status: item.status,
      },
    });
  }
}
