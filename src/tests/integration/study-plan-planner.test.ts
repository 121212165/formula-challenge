/**
 * Phase 9 StudyPlan 完整计划器集成测试 —— 真实 SQLite 库 + 真实 Prisma 仓储/UoW。
 *
 * 覆盖 hint 要求的全部行为：
 *   1) 三路候选齐全：due(review) / weakness(非到期薄弱项) / new(自发现未学 published)；
 *   2) 优先级排序：review > weakness > new（position 递增）；
 *   3) dailyItemTarget 超预算裁剪（注入 profileReader）；
 *   4) 同一用户同一 localDate 幂等，重复 generate 返回既有计划；
 *   5) SkipPlanItem：pending→skipped、幂等、completed 非法迁移、不存在 NotFound；
 *   6) BR-062：CompletePlanItem / SkipPlanItem 只改 item.status，LearningState 逐字段不变；
 *   7) BR-063：生成计划 source 写死 "scheduler"（无 AI 直接落计划入口）；
 *   8) 状态机负向：completed 终态不可再 complete / expire。
 *
 * 种子方式仿 get-user-progress.test.ts：直接 prisma 落 User/Subject/ContentItem/KP/
 * LearningState/ReviewEvent（绕开用例，只造读模型输入）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { PrismaUnitOfWork } from "@/shared/infrastructure/prisma-unit-of-work";
import { createPrismaLearningRepos } from "@/modules/learning/infrastructure";
import { PrismaKnowledgePointRepository } from "@/modules/knowledge/infrastructure/prisma-knowledge-point-repository";
import { PrismaStudyPlanRepository } from "@/modules/study-plan/infrastructure/prisma-study-plan-repository";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { SkipPlanItem } from "@/modules/study-plan/application/skip-plan-item";
import { CompletePlanItem } from "@/modules/study-plan/application/today-plan";
import { CompleteStudyPlan } from "@/modules/study-plan/application/complete-study-plan";
import { ExpireStudyPlan } from "@/modules/study-plan/application/expire-study-plan";
import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";

const prisma: PrismaClient = getTestPrisma();

const NOW = new Date("2026-09-18T08:00:00.000Z");
const LOCAL_DATE = "2026-09-18";
const KP_TYPE = "formula.plan9";

afterAll(async () => {
  await disconnectTestPrisma();
});

beforeAll(async () => {
  // 共享模板：@@unique([knowledgePointType, type])，整文件只建一个 free_recall 模板
  await prisma.questionTemplate.create({
    data: { id: "tpl-plan9", knowledgePointType: KP_TYPE, type: "free_recall", difficulty: 1 },
  });
});

/** 种子：User + Subject + ContentItem + 4 个 KP（due/weak/unseenA/unseenB/draft） */
async function seedBase(uid: string) {
  const subjectId = `subj-${uid}`;
  const contentItemId = `ci-${uid}`;
  await prisma.user.create({
    data: { id: uid, email: `${uid}@example.com`, timezone: "Asia/Shanghai" },
  });
  await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
  await prisma.contentItem.create({
    data: { id: contentItemId, subjectId, slug: `slug-${uid}`, name: "麻黄汤", status: "published" },
  });
  const kpDue = `kp-${uid}.due`;
  const kpWeak = `kp-${uid}.weak`;
  const kpNewA = `kp-${uid}.newA`;
  const kpNewB = `kp-${uid}.newB`;
  const kpDraft = `kp-${uid}.draft`;
  await prisma.knowledgePoint.create({
    data: { id: kpDue, contentItemId, code: kpDue, type: KP_TYPE, title: "due", canonicalAnswer: "a", status: "published", weight: 1 },
  });
  await prisma.knowledgePoint.create({
    data: { id: kpWeak, contentItemId, code: kpWeak, type: KP_TYPE, title: "weak", canonicalAnswer: "a", status: "published", weight: 1 },
  });
  // 高重要度优先
  await prisma.knowledgePoint.create({
    data: { id: kpNewA, contentItemId, code: kpNewA, type: KP_TYPE, title: "newA", canonicalAnswer: "a", status: "published", weight: 3 },
  });
  await prisma.knowledgePoint.create({
    data: { id: kpNewB, contentItemId, code: kpNewB, type: KP_TYPE, title: "newB", canonicalAnswer: "a", status: "published", weight: 1 },
  });
  // draft：不应被自发现为 new
  await prisma.knowledgePoint.create({
    data: { id: kpDraft, contentItemId, code: kpDraft, type: KP_TYPE, title: "draft", canonicalAnswer: "a", status: "draft", weight: 9 },
  });
  return { subjectId, kpDue, kpWeak, kpNewA, kpNewB, kpDraft };
}

/** 种子：一条 LearningState */
async function seedState(
  uid: string,
  kpId: string,
  s: { stability: number; reviewCount: number; lapseCount: number; dueAt: Date }
) {
  await prisma.learningState.upsert({
    where: { userId_knowledgePointId: { userId: uid, knowledgePointId: kpId } },
    create: {
      id: `ls-${kpId}`,
      userId: uid,
      knowledgePointId: kpId,
      stability: s.stability,
      difficulty: 5,
      retrievability: 0.8,
      dueAt: s.dueAt,
      lastReviewedAt: new Date("2026-09-17T08:00:00.000Z"),
      reviewCount: s.reviewCount,
      lapseCount: s.lapseCount,
      lastRating: "again",
      fsrsState: 1,
    },
    update: {},
  });
}

/** 种子：一次 again ReviewEvent（造 FK 链），作为 weakness 的 again 证据 */
async function seedAgainReview(uid: string, kpId: string) {
  const attempt = `att-${kpId}`;
  const reviewEvent = `re-${kpId}`;
  const session = `ss-${kpId}`;
  const sessionItem = `si-${kpId}`;
  const instance = `qi-${kpId}`;
  await prisma.studySession.create({ data: { id: session, userId: uid, subjectId: `subj-${uid}`, mode: "daily", status: "active" } });
  await prisma.sessionItem.create({ data: { id: sessionItem, sessionId: session, knowledgePointId: kpId, position: 0, status: "completed" } });
  await prisma.questionInstance.create({ data: { id: instance, sessionItemId: sessionItem, knowledgePointId: kpId, templateId: "tpl-plan9", sequence: 0 } });
  await prisma.attempt.create({
    data: {
      id: attempt, userId: uid, sessionId: session, sessionItemId: sessionItem, questionInstanceId: instance,
      knowledgePointId: kpId, userAnswer: "x", status: "reviewed", clientRequestId: `cr-${kpId}`,
    },
  });
  const snap = {
    stability: 0.5, difficulty: 5, retrievability: 0.4,
    dueAt: NOW.toISOString(), lastReviewedAt: NOW.toISOString(),
    reviewCount: 1, lapseCount: 1, lastRating: "again", fsrsState: 1,
  };
  await prisma.reviewEvent.create({
    data: { id: reviewEvent, attemptId: attempt, userId: uid, knowledgePointId: kpId, rating: "again", reviewedAt: NOW, previousState: snap, nextState: snap },
  });
}

function buildGenerate(
  uid: string,
  opts: { dailyItemTarget?: number; subjectIds?: string[] } = {}
) {
  const learningRepos = createPrismaLearningRepos(prisma);
  const planRepo = new PrismaStudyPlanRepository(prisma);
  const uow = new PrismaUnitOfWork({ prisma });
  return {
    learningRepos,
    planRepo,
    uow,
    uc: new GenerateStudyPlan({
      planRepo,
      learningRepos,
      uow,
      knowledgePoints: new PrismaKnowledgePointRepository(prisma),
      ...(opts.dailyItemTarget !== undefined
        ? { profileReader: { getDailyItemTarget: async () => opts.dailyItemTarget! } }
        : {}),
      idGen: () => `plan-${uid}-${Math.random().toString(36).slice(2)}`,
      now: () => NOW,
    }),
    subjectIds: opts.subjectIds,
  };
}

describe("Phase 9 完整计划器", () => {
  it("三路候选齐全且按 review > weakness > new 排序（含自发现 new、排除 draft）", async () => {
    const uid = "u-p9-tri";
    const base = await seedBase(uid);
    // due：已到期
    await seedState(uid, base.kpDue, {
      stability: 5, reviewCount: 2, lapseCount: 0, dueAt: new Date("2026-09-17T08:00:00.000Z"),
    });
    // weak：尚未到期，但 again×1 + lapseCount=1 + stability<1
    await seedAgainReview(uid, base.kpWeak);
    await seedState(uid, base.kpWeak, {
      stability: 0.5, reviewCount: 1, lapseCount: 1, dueAt: new Date("2026-09-25T08:00:00.000Z"),
    });

    const { uc, subjectIds } = buildGenerate(uid, { subjectIds: [base.subjectId] });
    const { plan, items } = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });

    // BR-063：source 由 use case 写死 scheduler
    expect(plan.source).toBe("scheduler");
    expect(plan.status).toBe("active");

    // 4 条：due / weak / newA / newB；draft 不出现；已学的 due/weak 不重复进 new
    expect(items.map((i) => i.knowledgePointId)).toEqual([
      base.kpDue,
      base.kpWeak,
      base.kpNewA,
      base.kpNewB,
    ]);
    expect(items.map((i) => i.type)).toEqual(["review", "weakness", "new", "new"]);
    // position 连续递增
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
    // weakness 带原因
    expect(items[1]!.reason).toContain("薄弱项");
    expect(items[1]!.reason).toContain("连续答错×1");
    // new 按重要度 weight 降序：newA(3) 在 newB(1) 前
    expect(items[2]!.knowledgePointId).toBe(base.kpNewA);
  });

  it("dailyItemTarget 超预算裁剪：高优先级保留，低优先级 new 被裁", async () => {
    const uid = "u-p9-budget";
    const base = await seedBase(uid);
    await seedState(uid, base.kpDue, {
      stability: 5, reviewCount: 2, lapseCount: 0, dueAt: new Date("2026-09-17T08:00:00.000Z"),
    });
    await seedAgainReview(uid, base.kpWeak);
    await seedState(uid, base.kpWeak, {
      stability: 0.5, reviewCount: 1, lapseCount: 1, dueAt: new Date("2026-09-25T08:00:00.000Z"),
    });

    // 4 候选（review/weak/newA/newB），dailyItemTarget=2 → 只留 review+weak
    const { uc, subjectIds } = buildGenerate(uid, { dailyItemTarget: 2, subjectIds: [base.subjectId] });
    const { items } = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.type)).toEqual(["review", "weakness"]);
    expect(items.map((i) => i.knowledgePointId)).toEqual([base.kpDue, base.kpWeak]);
  });

  it("同一用户同一 localDate 重复 generate 返回既有计划，不新建", async () => {
    const uid = "u-p9-idem";
    const base = await seedBase(uid);
    await seedState(uid, base.kpDue, {
      stability: 5, reviewCount: 2, lapseCount: 0, dueAt: new Date("2026-09-17T08:00:00.000Z"),
    });
    const { uc, subjectIds, planRepo } = buildGenerate(uid, { subjectIds: [base.subjectId] });

    const first = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });
    const second = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });

    expect(second.plan.id).toBe(first.plan.id);
    expect(second.items).toHaveLength(first.items.length);
    expect(await prisma.studyPlan.count({ where: { userId: uid } })).toBe(1);
    // planRepo 读到的仍是同一个
    expect((await planRepo.findByLocalDate(uid, LOCAL_DATE))?.id).toBe(first.plan.id);
  });

  it("SkipPlanItem：pending→skipped、重复跳过幂等、completed 非法、不存在 NotFound", async () => {
    const uid = "u-p9-skip";
    const base = await seedBase(uid);
    await seedState(uid, base.kpDue, {
      stability: 5, reviewCount: 2, lapseCount: 0, dueAt: new Date("2026-09-17T08:00:00.000Z"),
    });
    const { uc, subjectIds, planRepo, uow } = buildGenerate(uid, { subjectIds: [base.subjectId] });
    const { items } = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });
    const reviewItem = items.find((i) => i.knowledgePointId === base.kpDue)!;
    const newItem = items.find((i) => i.knowledgePointId === base.kpNewA)!;

    const skip = new SkipPlanItem({ planRepo, uow });
    const done = await skip.execute({ itemId: newItem.id });
    expect(done.status).toBe("skipped");
    // 幂等：再跳一次，原样返回不抛错
    const again = await skip.execute({ itemId: newItem.id });
    expect(again.status).toBe("skipped");

    // completed 不能跳过：先完成 review 项
    const complete = new CompletePlanItem({ planRepo, uow });
    await complete.execute({ itemId: reviewItem.id });
    const err = await skip.execute({ itemId: reviewItem.id }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidStateTransitionError);
    expect((err as InvalidStateTransitionError).code).toBe("INVALID_STATE_TRANSITION");

    // 不存在
    const nf = await skip.execute({ itemId: "no-such-item" }).catch((e) => e);
    expect(nf).toBeInstanceOf(NotFoundError);
  });

  it("BR-062：CompletePlanItem / SkipPlanItem 只改 item.status，LearningState 逐字段不变", async () => {
    const uid = "u-p9-br062";
    const base = await seedBase(uid);
    await seedState(uid, base.kpDue, {
      stability: 5, reviewCount: 2, lapseCount: 0, dueAt: new Date("2026-09-17T08:00:00.000Z"),
    });
    await seedAgainReview(uid, base.kpWeak);
    await seedState(uid, base.kpWeak, {
      stability: 0.5, reviewCount: 1, lapseCount: 1, dueAt: new Date("2026-09-25T08:00:00.000Z"),
    });
    const { uc, subjectIds, planRepo, uow } = buildGenerate(uid, { subjectIds: [base.subjectId] });
    const { items } = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });

    const dueItem = items.find((i) => i.knowledgePointId === base.kpDue)!;
    const weakItem = items.find((i) => i.knowledgePointId === base.kpWeak)!;

    // 快照两个 LearningState
    const snapDueBefore = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: uid, knowledgePointId: base.kpDue } },
    });
    const snapWeakBefore = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: uid, knowledgePointId: base.kpWeak } },
    });

    await new CompletePlanItem({ planRepo, uow }).execute({ itemId: dueItem.id });
    await new SkipPlanItem({ planRepo, uow }).execute({ itemId: weakItem.id });

    const dueAfter = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: uid, knowledgePointId: base.kpDue } },
    });
    const weakAfter = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: uid, knowledgePointId: base.kpWeak } },
    });
    // 逐字段比对（不含 id/审计）：掌握度字段一律不动
    for (const [before, after] of [[snapDueBefore, dueAfter], [snapWeakBefore, weakAfter]] as const) {
      expect(after?.stability).toBe(before?.stability);
      expect(after?.difficulty).toBe(before?.difficulty);
      expect(after?.retrievability).toBe(before?.retrievability);
      expect(after?.dueAt.getTime()).toBe(before?.dueAt.getTime());
      expect(after?.reviewCount).toBe(before?.reviewCount);
      expect(after?.lapseCount).toBe(before?.lapseCount);
      expect(after?.lastRating).toBe(before?.lastRating);
    }
  });

  it("状态机负向：completed 终态不可再 complete / expire", async () => {
    const uid = "u-p9-sm";
    const base = await seedBase(uid);
    const { uc, subjectIds, planRepo, uow } = buildGenerate(uid, { subjectIds: [base.subjectId] });
    const { plan } = await uc.execute({ userId: uid, localDate: LOCAL_DATE, subjectIds });

    const completePlan = new CompleteStudyPlan({ planRepo, uow });
    await completePlan.execute({ planId: plan.id });
    // 再次 complete → 非法迁移
    const errComplete = await completePlan.execute({ planId: plan.id }).catch((e) => e);
    expect(errComplete).toBeInstanceOf(InvalidStateTransitionError);
    // completed → expired 也非法
    const errExpire = await new ExpireStudyPlan({ planRepo, uow })
      .execute({ planId: plan.id })
      .catch((e) => e);
    expect(errExpire).toBeInstanceOf(InvalidStateTransitionError);
  });
});
