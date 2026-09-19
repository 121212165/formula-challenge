/**
 * Prisma 生产仓储 —— UserLearningProfile。
 * 行有独立 id 主键 + userId @unique；save 按 userId upsert。
 * 领域 UserLearningProfile 没有 id 字段，故行的 id 在 create 时由应用层生成。
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { UserLearningProfile } from "../domain/user";
import type { UserProfileRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  dailyMinutes: number;
  dailyItemTarget: number;
  learningStage: UserLearningProfile["learningStage"];
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): UserLearningProfile {
  return {
    userId: row.userId,
    dailyMinutes: row.dailyMinutes,
    dailyItemTarget: row.dailyItemTarget,
    learningStage: row.learningStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByUserId(userId: string): Promise<UserLearningProfile | null> {
    const row = await this.db.userLearningProfile.findUnique({ where: { userId } });
    return row ? toDomain(row) : null;
  }

  async save(profile: UserLearningProfile): Promise<void> {
    await this.db.userLearningProfile.upsert({
      where: { userId: profile.userId },
      create: {
        id: randomUUID(),
        userId: profile.userId,
        dailyMinutes: profile.dailyMinutes,
        dailyItemTarget: profile.dailyItemTarget,
        learningStage: profile.learningStage,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      update: {
        dailyMinutes: profile.dailyMinutes,
        dailyItemTarget: profile.dailyItemTarget,
        learningStage: profile.learningStage,
        updatedAt: profile.updatedAt,
      },
    });
  }
}
