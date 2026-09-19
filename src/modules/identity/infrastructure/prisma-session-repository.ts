/**
 * Prisma 生产仓储 —— AuthSession（登录会话，Phase 5）。
 * tokenHash @unique；find 按 tokenHash 查；save 按 id upsert。
 * 只存哈希，绝不回读明文令牌。模式同 prisma-auth-token-repository.ts。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { AuthSession } from "../domain/user";
import type { SessionRepository } from "../domain/repositories";

type Row = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

function toDomain(row: Row): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const row = await this.db.authSession.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async save(session: AuthSession): Promise<void> {
    await this.db.authSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
      },
      update: {
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      },
    });
  }
}
