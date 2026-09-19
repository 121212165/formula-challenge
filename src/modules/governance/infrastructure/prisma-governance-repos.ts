/**
 * Governance 模块 Prisma 仓储组装工厂。
 */
import type { PrismaClient } from "@prisma/client";
import type { GovernanceRepositories } from "../domain/repositories";
import { PrismaContentIssueRepository } from "./prisma-content-issue-repository";

export function createGovernanceRepos(prisma: PrismaClient): GovernanceRepositories {
  return {
    contentIssues: new PrismaContentIssueRepository(prisma),
  };
}
