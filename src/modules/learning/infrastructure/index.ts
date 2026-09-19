/**
 * Learning 模块 Prisma 生产仓储聚合工厂。
 *
 * 把全部 7 个仓储（本次新增 6 个 + 已存在的 PrismaLearningStateRepository）
 * 组装成 domain/repositories.ts 的 LearningRepositories 形状。
 * 键名与 LearningRepositories 接口严格一致：
 *   attempts / evaluations / reviewEvents / learningStates / sessions / sessionItems / studyDays。
 */
import type { PrismaClient } from "@prisma/client";
import type { LearningRepositories } from "../domain/repositories";
import { PrismaLearningStateRepository } from "./prisma-learning-state-repository";
import { PrismaAttemptRepository } from "./prisma-attempt-repository";
import { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
import { PrismaReviewEventRepository } from "./prisma-review-event-repository";
import { PrismaStudySessionRepository } from "./prisma-study-session-repository";
import { PrismaSessionItemRepository } from "./prisma-session-item-repository";
import { PrismaStudyDayRepository } from "./prisma-study-day-repository";

export function createPrismaLearningRepos(prisma: PrismaClient): LearningRepositories {
  return {
    attempts: new PrismaAttemptRepository(prisma),
    evaluations: new PrismaEvaluationRepository(prisma),
    reviewEvents: new PrismaReviewEventRepository(prisma),
    learningStates: new PrismaLearningStateRepository(prisma),
    sessions: new PrismaStudySessionRepository(prisma),
    sessionItems: new PrismaSessionItemRepository(prisma),
    studyDays: new PrismaStudyDayRepository(prisma),
  };
}

export { PrismaLearningStateRepository } from "./prisma-learning-state-repository";
export { PrismaAttemptRepository } from "./prisma-attempt-repository";
export { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
export { PrismaReviewEventRepository } from "./prisma-review-event-repository";
export { PrismaStudySessionRepository } from "./prisma-study-session-repository";
export { PrismaSessionItemRepository } from "./prisma-session-item-repository";
export { PrismaStudyDayRepository } from "./prisma-study-day-repository";
