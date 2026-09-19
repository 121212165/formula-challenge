/**
 * Content 域 Prisma 仓储工厂 —— 组装 ContentRepositories。
 * 仅装配通用 Content 仓储；FormulaContent/HerbContent/Meridian 扩展表无对应 Repository 接口，不在此实现。
 */
import type { PrismaClient } from "@prisma/client";
import type { ContentRepositories } from "../domain/repositories";
import { PrismaContentItemRepository } from "./prisma-content-item-repository";
import { PrismaContentSourceRepository } from "./prisma-content-source-repository";
import { PrismaContentVersionRepository } from "./prisma-content-version-repository";

export function createPrismaContentRepos(prisma: PrismaClient): ContentRepositories {
  return {
    contentItems: new PrismaContentItemRepository(prisma),
    contentSources: new PrismaContentSourceRepository(prisma),
    contentVersions: new PrismaContentVersionRepository(prisma),
  };
}
