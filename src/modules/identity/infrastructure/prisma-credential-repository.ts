/**
 * Prisma 生产仓储 —— Credential。
 * userId 即主键；save 按 userId upsert。密码哈希永不回读进领域对象之外的逻辑。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { Credential } from "../domain/user";
import type { CredentialRepository } from "../domain/repositories";

type Row = {
  userId: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): Credential {
  return {
    userId: row.userId,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findByUserId(userId: string): Promise<Credential | null> {
    const row = await this.db.credential.findUnique({ where: { userId } });
    return row ? toDomain(row) : null;
  }

  async save(credential: Credential): Promise<void> {
    await this.db.credential.upsert({
      where: { userId: credential.userId },
      create: {
        userId: credential.userId,
        passwordHash: credential.passwordHash,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      },
      update: {
        passwordHash: credential.passwordHash,
        updatedAt: credential.updatedAt,
      },
    });
  }
}
