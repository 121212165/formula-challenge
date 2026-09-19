/**
 * Prisma 生产仓储 —— User。
 * 模式样板：prisma-learning-state-repository.ts
 *  - 构造注入根 PrismaClient；每个方法走 getClient(this.prisma)（事务内自动切 tx）。
 *  - 行 → 领域 / 领域 → 行 映射集中在 toDomain。
 *  - 唯一冲突（邮箱 @unique 等）由上层用例映射为 ConflictError；这里不吞错。
 *  - id 由应用层生成（cuid/uuid），save 直接透传，不依赖 DB 默认值。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import type { User } from "../domain/user";
import type { UserRepository } from "../domain/repositories";

type Row = {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db() {
    return getClient(this.prisma);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    await this.db.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      update: {
        email: user.email,
        name: user.name,
        timezone: user.timezone,
        emailVerifiedAt: user.emailVerifiedAt,
        updatedAt: user.updatedAt,
      },
    });
  }
}
