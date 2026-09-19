/**
 * Prisma 生产仓储 —— UserSubjectPreference（Onboarding 选科目）。
 * 表有独立 id 主键 + @@unique([userId, subjectId])；save 按该复合唯一键 upsert。
 * 领域 UserSubjectPreference 没有 id，行 id 在 create 时由仓储生成。
 * 只读写科目偏好，不触碰任何学习状态。
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { UserSubjectPreference } from "../domain/user";
import type { SubjectPreferenceRepository } from "../domain/repositories";

type Row = {
  userId: string;
  subjectId: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): UserSubjectPreference {
  return {
    userId: row.userId,
    subjectId: row.subjectId,
    enabled: row.enabled,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaSubjectPreferenceRepository implements SubjectPreferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByUserId(userId: string): Promise<UserSubjectPreference[]> {
    const rows = await this.db.userSubjectPreference.findMany({ where: { userId } });
    return rows.map(toDomain);
  }

  async save(preference: UserSubjectPreference): Promise<void> {
    await this.db.userSubjectPreference.upsert({
      where: { userId_subjectId: { userId: preference.userId, subjectId: preference.subjectId } },
      create: {
        id: randomUUID(),
        userId: preference.userId,
        subjectId: preference.subjectId,
        enabled: preference.enabled,
        priority: preference.priority,
        createdAt: preference.createdAt,
        updatedAt: preference.updatedAt,
      },
      update: {
        enabled: preference.enabled,
        priority: preference.priority,
        updatedAt: preference.updatedAt,
      },
    });
  }
}
