/**
 * Identity 模块 Prisma 仓储组装工厂。
 * 传入根 PrismaClient，返回 IdentityRepositories；各仓储内部用 getClient 自动适配事务。
 */
import type { PrismaClient } from "@prisma/client";
import type { IdentityRepositories } from "../domain/repositories";
import { PrismaUserRepository } from "./prisma-user-repository";
import { PrismaUserProfileRepository } from "./prisma-user-profile-repository";
import { PrismaCredentialRepository } from "./prisma-credential-repository";
import { PrismaAuthTokenRepository } from "./prisma-auth-token-repository";
import { PrismaSessionRepository } from "./prisma-session-repository";
import { PrismaSubjectPreferenceRepository } from "./prisma-subject-preference-repository";

export function createPrismaIdentityRepos(prisma: PrismaClient): IdentityRepositories {
  return {
    users: new PrismaUserRepository(prisma),
    profiles: new PrismaUserProfileRepository(prisma),
    credentials: new PrismaCredentialRepository(prisma),
    subjectPrefs: new PrismaSubjectPreferenceRepository(prisma),
    tokens: new PrismaAuthTokenRepository(prisma),
    sessions: new PrismaSessionRepository(prisma),
  };
}
