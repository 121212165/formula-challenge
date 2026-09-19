/**
 * Prisma 生产仓储 —— AuthToken（邮箱验证 / 密码重置）。
 * 两张表结构一致：id 主键（应用层生成）+ tokenHash @unique。
 * find 按 tokenHash 查；save 按 id upsert，tokenHash 唯一冲突透传上层。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { EmailVerificationToken, PasswordResetToken } from "../domain/user";
import type { AuthTokenRepository } from "../domain/repositories";

type EmailRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type ResetRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

function toEmailDomain(row: EmailRow): EmailVerificationToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function toResetDomain(row: ResetRow): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaAuthTokenRepository implements AuthTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    const row = await this.db.emailVerificationToken.findUnique({ where: { tokenHash } });
    return row ? toEmailDomain(row) : null;
  }

  async saveVerificationToken(token: EmailVerificationToken): Promise<void> {
    await this.db.emailVerificationToken.upsert({
      where: { id: token.id },
      create: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        createdAt: token.createdAt,
      },
      update: {
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      },
    });
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.db.passwordResetToken.findUnique({ where: { tokenHash } });
    return row ? toResetDomain(row) : null;
  }

  async savePasswordResetToken(token: PasswordResetToken): Promise<void> {
    await this.db.passwordResetToken.upsert({
      where: { id: token.id },
      create: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        createdAt: token.createdAt,
      },
      update: {
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      },
    });
  }
}
