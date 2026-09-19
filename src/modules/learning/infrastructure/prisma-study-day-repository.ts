/**
 * Prisma 生产仓储 —— StudyDay。
 * UNIQUE(userId, localDate)（BR-070）；按该键 upsert。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { StudyDay } from "../domain/study-day";
import type { StudyDayRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  localDate: string;
  minutes: number;
  attemptCount: number;
  correctCount: number;
  reviewCount: number;
  newCount: number;
  completedSessionCount: number;
};

function toDomain(row: Row): StudyDay {
  return {
    id: row.id,
    userId: row.userId,
    localDate: row.localDate,
    minutes: row.minutes,
    attemptCount: row.attemptCount,
    correctCount: row.correctCount,
    reviewCount: row.reviewCount,
    newCount: row.newCount,
    completedSessionCount: row.completedSessionCount,
  };
}

export class PrismaStudyDayRepository implements StudyDayRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async find(userId: string, localDate: string): Promise<StudyDay | null> {
    const row = await this.db.studyDay.findUnique({
      where: { userId_localDate: { userId, localDate } },
    });
    return row ? toDomain(row) : null;
  }

  async upsert(day: StudyDay): Promise<void> {
    await this.db.studyDay.upsert({
      where: { userId_localDate: { userId: day.userId, localDate: day.localDate } },
      create: {
        id: day.id,
        userId: day.userId,
        localDate: day.localDate,
        minutes: day.minutes,
        attemptCount: day.attemptCount,
        correctCount: day.correctCount,
        reviewCount: day.reviewCount,
        newCount: day.newCount,
        completedSessionCount: day.completedSessionCount,
      },
      update: {
        minutes: day.minutes,
        attemptCount: day.attemptCount,
        correctCount: day.correctCount,
        reviewCount: day.reviewCount,
        newCount: day.newCount,
        completedSessionCount: day.completedSessionCount,
      },
    });
  }
}
