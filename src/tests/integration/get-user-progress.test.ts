/**
 * GetUserProgress 读模型集成测试（Phase 7 验收 5）—— 真实 SQLite 库。
 *
 * 直接用 PrismaClient 种子 LearningState + ReviewEvent（绕开用例，只造读模型输入），
 * 断言 GetUserProgress 的结构化输出：coverage 分字段 / reviewedCount / dueList /
 * weakList（任务 C）/ stability 分布。不折叠成单一 mastery 百分比。
 *
 * 种子链：User → Subject → ContentItem → KnowledgePoint(published) →
 *   StudySession → SessionItem → QuestionInstance → Attempt → ReviewEvent；
 *   LearningState 直接 upsert（@@unique(userId, knowledgePointId)）。
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { createPrismaLearningRepos } from "@/modules/learning/infrastructure";
import { PrismaKnowledgePointRepository } from "@/modules/knowledge/infrastructure/prisma-knowledge-point-repository";
import { GetUserProgress } from "@/modules/learning/application/get-user-progress";
import type { ReviewRating } from "@/shared/types/rating";

const prisma: PrismaClient = getTestPrisma();

const NOW = new Date("2026-09-18T08:00:00.000Z");

interface BaseIds {
  user: string;
  subject: string;
  contentItem: string;
  kpBase: string;
}

/** 种子：User + Subject + ContentItem + 三个 published KnowledgePoint（good/weak/unseen） + 一个共享 free_recall 模板 */
async function seedBase(ids: BaseIds, kpType: string): Promise<void> {
  await prisma.user.create({
    data: { id: ids.user, email: `${ids.user}@example.com`, timezone: "Asia/Shanghai" },
  });
  await prisma.subject.create({
    data: { id: ids.subject, code: ids.subject, name: "方剂" },
  });
  await prisma.contentItem.create({
    data: {
      id: ids.contentItem,
      subjectId: ids.subject,
      slug: "mahuangtang",
      name: "麻黄汤",
      status: "published",
    },
  });
  for (const kpId of [`${ids.kpBase}.good`, `${ids.kpBase}.weak`, `${ids.kpBase}.unseen`]) {
    await prisma.knowledgePoint.create({
      data: {
        id: kpId,
        contentItemId: ids.contentItem,
        code: kpId,
        type: kpType,
        title: `KP ${kpId}`,
        canonicalAnswer: "答案",
        status: "published",
      },
    });
  }
  // QuestionTemplate @@unique([knowledgePointType, type])：同 kpType 只建一个 free_recall 模板，所有 review 共享
  await prisma.questionTemplate.create({
    data: { id: `tpl-${kpType}`, knowledgePointType: kpType, type: "free_recall", difficulty: 1 },
  });
}

interface ReviewSeed {
  user: string;
  subject: string;
  kpId: string;
  kpType: string;
  /** 本轮 review 的 attempt / reviewEvent / session / item / instance 唯一 id */
  attempt: string;
  reviewEvent: string;
  session: string;
  sessionItem: string;
  instance: string;
  rating: ReviewRating;
  reviewedAt: Date;
  /** 该快照 nextState（用于落 ReviewEvent.nextState JSON） */
  next: { stability: number; difficulty: number; retrievability: number; dueAt: Date; reviewCount: number; lapseCount: number };
}

/** 种子：一次 ReviewEvent 所需的完整 FK 链 + ReviewEvent 行（LearningState 由调用方统一 upsert；模板已在 seedBase 建好） */
async function seedReview(r: ReviewSeed): Promise<void> {
  await prisma.studySession.create({
    data: { id: r.session, userId: r.user, subjectId: r.subject, mode: "daily", status: "active" },
  });
  await prisma.sessionItem.create({
    data: { id: r.sessionItem, sessionId: r.session, knowledgePointId: r.kpId, position: 0, status: "completed" },
  });
  await prisma.questionInstance.create({
    data: { id: r.instance, sessionItemId: r.sessionItem, knowledgePointId: r.kpId, templateId: `tpl-${r.kpType}`, sequence: 0 },
  });
  await prisma.attempt.create({
    data: {
      id: r.attempt,
      userId: r.user,
      sessionId: r.session,
      sessionItemId: r.sessionItem,
      questionInstanceId: r.instance,
      knowledgePointId: r.kpId,
      userAnswer: "x",
      status: "reviewed",
      clientRequestId: `cr-${r.attempt}`,
    },
  });
  const snap = {
    stability: r.next.stability,
    difficulty: r.next.difficulty,
    retrievability: r.next.retrievability,
    dueAt: r.next.dueAt.toISOString(),
    lastReviewedAt: r.reviewedAt.toISOString(),
    reviewCount: r.next.reviewCount,
    lapseCount: r.next.lapseCount,
    lastRating: r.rating,
    fsrsState: 1,
  };
  await prisma.reviewEvent.create({
    data: {
      id: r.reviewEvent,
      attemptId: r.attempt,
      userId: r.user,
      knowledgePointId: r.kpId,
      rating: r.rating,
      reviewedAt: r.reviewedAt,
      previousState: snap,
      nextState: snap,
    },
  });
}

/** 种子：LearningState 行（upsert） */
async function seedState(
  user: string,
  kpId: string,
  s: { stability: number; reviewCount: number; lapseCount: number; lastRating: ReviewRating; dueAt: Date; lastReviewedAt: Date }
): Promise<void> {
  await prisma.learningState.upsert({
    where: { userId_knowledgePointId: { userId: user, knowledgePointId: kpId } },
    create: {
      id: `ls-${kpId}`,
      userId: user,
      knowledgePointId: kpId,
      stability: s.stability,
      difficulty: 5,
      retrievability: 0.8,
      dueAt: s.dueAt,
      lastReviewedAt: s.lastReviewedAt,
      reviewCount: s.reviewCount,
      lapseCount: s.lapseCount,
      lastRating: s.lastRating,
      fsrsState: 1,
    },
    update: {
      stability: s.stability,
      reviewCount: s.reviewCount,
      lapseCount: s.lapseCount,
      lastRating: s.lastRating,
      dueAt: s.dueAt,
      lastReviewedAt: s.lastReviewedAt,
    },
  });
}

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("GetUserProgress 读模型（验收 5）", () => {
  it("coverage 分字段 / reviewedCount / dueList / weakList / 稳定性分布 全部正确", async () => {
    const base = { user: "u-prog-1", subject: "subj-prog-1", contentItem: "ci-prog-1", kpBase: "kp-prog-1" };
    const kpType = "formula.prog";
    await seedBase(base, kpType);
    const kpGood = "kp-prog-1.good";
    const kpWeak = "kp-prog-1.weak";

    // good KP：1 次 good 复习，dueAt 在未来
    await seedReview({
      user: base.user, subject: base.subject, kpId: kpGood, kpType,
      attempt: "att-prog-g", reviewEvent: "re-prog-g",
      session: "ss-prog-g", sessionItem: "si-prog-g", instance: "qi-prog-g",
      rating: "good", reviewedAt: new Date("2026-09-17T08:00:00.000Z"),
      next: { stability: 10, difficulty: 5, retrievability: 0.9, dueAt: new Date("2026-09-27T08:00:00.000Z"), reviewCount: 1, lapseCount: 0 },
    });
    await seedState(base.user, kpGood, {
      stability: 10, reviewCount: 1, lapseCount: 0, lastRating: "good",
      dueAt: new Date("2026-09-27T08:00:00.000Z"), lastReviewedAt: new Date("2026-09-17T08:00:00.000Z"),
    });

    // weak KP：连续两次 again（重复答错），dueAt 已过期，stability 极低
    await seedReview({
      user: base.user, subject: base.subject, kpId: kpWeak, kpType,
      attempt: "att-prog-w1", reviewEvent: "re-prog-w1",
      session: "ss-prog-w1", sessionItem: "si-prog-w1", instance: "qi-prog-w1",
      rating: "again", reviewedAt: new Date("2026-09-17T08:00:00.000Z"),
      next: { stability: 0.5, difficulty: 5, retrievability: 0.5, dueAt: new Date("2026-09-17T08:05:00.000Z"), reviewCount: 1, lapseCount: 1 },
    });
    await seedReview({
      user: base.user, subject: base.subject, kpId: kpWeak, kpType,
      attempt: "att-prog-w2", reviewEvent: "re-prog-w2",
      session: "ss-prog-w2", sessionItem: "si-prog-w2", instance: "qi-prog-w2",
      rating: "again", reviewedAt: new Date("2026-09-18T07:00:00.000Z"),
      next: { stability: 0.5, difficulty: 5, retrievability: 0.4, dueAt: new Date("2026-09-18T07:05:00.000Z"), reviewCount: 2, lapseCount: 1 },
    });
    await seedState(base.user, kpWeak, {
      stability: 0.5, reviewCount: 2, lapseCount: 1, lastRating: "again",
      dueAt: new Date("2026-09-18T07:05:00.000Z"), lastReviewedAt: new Date("2026-09-18T07:00:00.000Z"),
    });

    const repos = createPrismaLearningRepos(prisma);
    const useCase = new GetUserProgress({
      learningStates: repos.learningStates,
      reviewEvents: repos.reviewEvents,
      knowledgePoints: new PrismaKnowledgePointRepository(prisma),
    });

    const result = await useCase.execute({ userId: base.user, subjectId: base.subject, now: NOW });

    // coverage：3 个 published，已学 2 个（good + weak；unseen 未学）
    expect(result.coverage.publishedTotal).toBe(3);
    expect(result.coverage.learnedCount).toBe(2);
    expect(result.coverage.subjectId).toBe(base.subject);

    // reviewedCount：1 good + 2 again = 3
    expect(result.reviewedCount).toBe(3);

    // dueList：只有 weak（dueAt 07:05 <= 08:00）；good 的 dueAt 在未来
    expect(result.dueList).toHaveLength(1);
    expect(result.dueList[0]!.knowledgePointId).toBe(kpWeak);
    expect(result.dueList[0]!.stability).toBeCloseTo(0.5);

    // weakList：只有 weak；good 不进
    expect(result.weakList).toHaveLength(1);
    const weak = result.weakList[0]!;
    expect(weak.knowledgePointId).toBe(kpWeak);
    const reasonTypes = weak.reasons.map((r) => r.type);
    expect(reasonTypes).toContain("again");
    expect(reasonTypes).toContain("lapse");
    expect(reasonTypes).toContain("low_stability");
    const againReason = weak.reasons.find((r) => r.type === "again") as { type: "again"; count: number };
    expect(againReason.count).toBe(2);

    // 稳定性分布：weak=0.5 → lt1day；good=10 → d7to30days
    expect(result.stabilityDistribution.total).toBe(2);
    expect(result.stabilityDistribution.lt1day).toBe(1);
    expect(result.stabilityDistribution.d7to30days).toBe(1);
    expect(result.stabilityDistribution.d1to7days).toBe(0);
    expect(result.stabilityDistribution.gte30days).toBe(0);
  }, 30000);

  it("全新用户：coverage 分母仍正确，其余全空/零", async () => {
    const base = { user: "u-prop-empty", subject: "subj-prog-empty", contentItem: "ci-prog-empty", kpBase: "kp-prog-empty" };
    await seedBase(base, "formula.empty");

    const repos = createPrismaLearningRepos(prisma);
    const useCase = new GetUserProgress({
      learningStates: repos.learningStates,
      reviewEvents: repos.reviewEvents,
      knowledgePoints: new PrismaKnowledgePointRepository(prisma),
    });

    const result = await useCase.execute({ userId: base.user, subjectId: base.subject, now: NOW });

    expect(result.coverage.publishedTotal).toBe(3);
    expect(result.coverage.learnedCount).toBe(0);
    expect(result.reviewedCount).toBe(0);
    expect(result.dueList).toHaveLength(0);
    expect(result.weakList).toHaveLength(0);
    expect(result.stabilityDistribution.total).toBe(0);
  }, 30000);
});
