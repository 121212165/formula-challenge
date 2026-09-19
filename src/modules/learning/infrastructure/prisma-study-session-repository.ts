/**
 * Prisma 生产仓储 —— StudySession。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { StudySession, StudySessionMode, StudySessionStatus } from "../domain/session";
import type { StudySessionRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  subjectId: string;
  mode: StudySessionMode;
  startedAt: Date;
  endedAt: Date | null;
  status: StudySessionStatus;
  durationSeconds: number;
};

function toDomain(row: Row): StudySession {
  return {
    id: row.id,
    userId: row.userId,
    subjectId: row.subjectId,
    mode: row.mode,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status,
    durationSeconds: row.durationSeconds,
  };
}

export class PrismaStudySessionRepository implements StudySessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<StudySession | null> {
    const row = await this.db.studySession.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(session: StudySession): Promise<void> {
    await this.db.studySession.create({
      data: {
        id: session.id,
        userId: session.userId,
        subjectId: session.subjectId,
        mode: session.mode,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
        durationSeconds: session.durationSeconds,
      },
    });
  }
}
