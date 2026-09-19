/**
 * MVP 端到端闭环集成测试（Phase 7 验收 4）—— 真实 SQLite 库 + 真实 PrismaUnitOfWork。
 *
 * 把整条用户闭环串起来并逐步断言（仿 real-tx.test.ts 的 seedChain + getTestPrisma）：
 *   注册用户 → CompleteOnboarding（选科目 方剂 formula）→
 *   GenerateStudyPlan / GetTodayPlan（今日计划）→
 *   StartStudySession → GenerateQuestion（free_recall）→
 *   SubmitAttempt 作答 → EvaluateAttempt 系统评分 →
 *   FinalizeReview 评级 good →
 *   断言 LearningState 落库 reviewCount=1、dueAt 在未来；SessionItem completed；
 *   CompletePlanItem 后 StudyPlanItem completed；
 *   调用 GetUserProgress 断言 coverage / reviewedCount / dueList / weakList。
 *
 * 内容侧（Subject/ContentItem/KnowledgePoint/QuestionTemplate）是种子数据，直接用 prisma 落；
 * 学习/身份/计划用例全部走真实事务。
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { PrismaUnitOfWork } from "@/shared/infrastructure/prisma-unit-of-work";
import { createPrismaLearningRepos } from "@/modules/learning/infrastructure";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { SubmitAttempt } from "@/modules/learning/application/submit-attempt";
import { EvaluateAttempt } from "@/modules/learning/application/evaluate-attempt";
import { StartStudySession } from "@/modules/learning/application/start-study-session";
import { GenerateQuestion } from "@/modules/question/application/generate-question";
import { buildDefaultQuestionRegistry } from "@/modules/question/domain/registry";
import { FormulaEvaluator } from "@/modules/question/application/subject-evaluators";
import { PrismaQuestionRepository } from "@/modules/question/infrastructure/prisma-question-repository";
import { PrismaKnowledgePointRepository } from "@/modules/knowledge/infrastructure/prisma-knowledge-point-repository";
import { PrismaStudyPlanRepository } from "@/modules/study-plan/infrastructure/prisma-study-plan-repository";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { GetTodayPlan, CompletePlanItem } from "@/modules/study-plan/application/today-plan";
import { createPrismaIdentityRepos } from "@/modules/identity/infrastructure/prisma-identity-repos";
import { RegisterUser } from "@/modules/identity/application/register-user";
import { CompleteOnboarding } from "@/modules/identity/application/complete-onboarding";
import { ScryptPasswordHasher } from "@/modules/identity/infrastructure/scrypt-password-hasher";
import { GetUserProgress } from "@/modules/learning/application/get-user-progress";

const prisma: PrismaClient = getTestPrisma();

// 固定时间线（UTC）。学习发生在 2026-09-18 08:10。
const REGISTER_AT = new Date("2026-09-18T08:00:00.000Z");
const STUDY_AT = new Date("2026-09-18T08:10:00.000Z");
const LOCAL_DATE = "2026-09-18";
// 未来时刻：用于让 good 产生的 dueAt 到期，验证 dueList 非空
const FUTURE_NOW = new Date("2026-12-27T08:00:00.000Z");

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("MVP 端到端闭环（验收 4）：注册→Onboarding→计划→Session→出题→作答→评分→复习→进度", () => {
  it("整条用户闭环逐步落库并断言，进度读模型符合预期", async () => {
    // ── 0. 种子：内容侧（科目/内容项/知识点/模板）。每个 id 本测试唯一。 ──
    const subjectId = "subj-mvp";
    const contentItemId = "ci-mvp";
    const kpMain = "kp-mvp-main"; // 本次学习的知识点
    const kpUnseen = "kp-mvp-unseen"; // 已发布但未学，用于 coverage 分母
    const kpType = "formula.mvp";

    await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
    await prisma.contentItem.create({
      data: { id: contentItemId, subjectId, slug: "mahuangtang-mvp", name: "麻黄汤", status: "published" },
    });
    for (const kpId of [kpMain, kpUnseen]) {
      await prisma.knowledgePoint.create({
        data: {
          id: kpId,
          contentItemId,
          code: kpId,
          type: kpType,
          title: "麻黄汤·组成",
          canonicalAnswer: "麻黄、桂枝、杏仁、甘草",
          status: "published",
        },
      });
    }
    await prisma.questionTemplate.create({
      data: { id: "tpl-mvp", knowledgePointType: kpType, type: "free_recall", difficulty: 1 },
    });

    // 共享仓储 / UoW
    const identityRepos = createPrismaIdentityRepos(prisma);
    const learningRepos = createPrismaLearningRepos(prisma);
    const questions = new PrismaQuestionRepository(prisma);
    const knowledgePoints = new PrismaKnowledgePointRepository(prisma);
    const planRepo = new PrismaStudyPlanRepository(prisma);
    const uow = new PrismaUnitOfWork({ prisma });

    // ── 1. 注册用户 ──
    const register = new RegisterUser({
      repos: identityRepos,
      hasher: new ScryptPasswordHasher(),
      uow,
      idGen: () => "u-mvp",
      now: () => REGISTER_AT,
    });
    const reg = await register.execute({
      email: "mvp@example.com",
      password: "long-enough-pw",
      timezone: "Asia/Shanghai",
    });
    expect(reg.user.id).toBe("u-mvp");
    expect(await prisma.user.findUnique({ where: { id: "u-mvp" } })).not.toBeNull();

    // ── 2. CompleteOnboarding（选科目 方剂）──
    const onboarding = new CompleteOnboarding({
      repos: identityRepos,
      uow,
      idGen: () => "pref-mvp-1",
      now: () => REGISTER_AT,
    });
    const ob = await onboarding.execute({ userId: "u-mvp", subjectIds: [subjectId] });
    expect(ob.preferences[0]!.subjectId).toBe(subjectId);
    expect(
      await prisma.userSubjectPreference.count({ where: { userId: "u-mvp", subjectId } })
    ).toBe(1);

    // ── 3. 生成/获取今日 StudyPlan（雏形：due 复习 + newKnowledgePointIds 新知识补齐）──
    // 全新用户无 due 项，按 generate-study-plan 现状：由上层传入新知识点候选。
    const generatePlan = new GenerateStudyPlan({
      planRepo,
      learningRepos,
      uow,
      idGen: () => `plan-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
    });
    const planResult = await generatePlan.execute({
      userId: "u-mvp",
      localDate: LOCAL_DATE,
      newKnowledgePointIds: [kpMain],
    });
    expect(planResult.plan.status).toBe("active");
    expect(planResult.items).toHaveLength(1);
    expect(planResult.items[0]!.knowledgePointId).toBe(kpMain);
    expect(planResult.items[0]!.type).toBe("new");
    const planItemId = planResult.items[0]!.id;

    const getToday = new GetTodayPlan({ planRepo });
    const today = await getToday.execute({ userId: "u-mvp", localDate: LOCAL_DATE });
    expect(today.plan?.id).toBe(planResult.plan.id);
    expect(today.items).toHaveLength(1);
    expect(today.items[0]!.status).toBe("pending");

    // ── 4. StartStudySession ──
    const startSession = new StartStudySession({
      repos: learningRepos,
      knowledgePoints,
      uow,
      idGen: () => `ss-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
    });
    const started = await startSession.execute({
      userId: "u-mvp",
      subjectId,
      knowledgePointIds: [kpMain],
    });
    expect(started.session.status).toBe("active");
    expect(started.items).toHaveLength(1);
    const sessionItemId = started.items[0]!.id;

    // ── 5. GenerateQuestion（free_recall）──
    const generateQ = new GenerateQuestion({
      questions,
      knowledgePoints,
      sessionItems: learningRepos.sessionItems,
      uow,
      idGen: () => `qi-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
      registry: buildDefaultQuestionRegistry(),
    });
    const q = await generateQ.execute({ sessionItemId, knowledgePointId: kpMain, type: "free_recall" });
    expect(q.question).not.toBeNull();
    expect(q.question!.kind).toBe("free_recall");
    // SessionItem.questionInstanceId 已回写（题目链路闭合）
    const siAfterGen = await prisma.sessionItem.findUnique({ where: { id: sessionItemId } });
    expect(siAfterGen?.questionInstanceId).toBe(q.instance.id);

    // ── 6. SubmitAttempt 作答（正确答案）──
    const submit = new SubmitAttempt({
      repos: learningRepos,
      questions,
      knowledgePoints,
      uow,
      idGen: () => `att-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
    });
    const submitted = await submit.execute({
      userId: "u-mvp",
      sessionItemId,
      userAnswer: "麻黄、桂枝、杏仁、甘草",
      clientRequestId: "cr-mvp-1",
      startedAt: new Date(STUDY_AT.getTime() - 60_000),
    });
    expect(submitted.created).toBe(true);
    expect(submitted.attempt.status).toBe("submitted");

    // ── 7. EvaluateAttempt 系统评分 ──
    const evaluate = new EvaluateAttempt({
      repos: learningRepos,
      knowledgePoints,
      questions,
      evaluator: new FormulaEvaluator(),
      uow,
      idGen: () => `ev-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
    });
    const ev = await evaluate.execute({ attemptId: submitted.attempt.id });
    expect(ev.created).toBe(true);
    expect(ev.isCorrect).toBe(true);
    // Evaluation 落库
    expect(await prisma.evaluation.count({ where: { attemptId: submitted.attempt.id } })).toBe(1);

    // ── 8. FinalizeReview 用户选 good ──
    const finalize = new FinalizeReview({
      repos: learningRepos,
      uow,
      scheduler: new FsrsScheduler(),
      idGen: () => `rev-${Math.random().toString(36).slice(2)}`,
      now: () => STUDY_AT,
      getLocalDate: async () => LOCAL_DATE,
    });
    const rv = await finalize.execute({ attemptId: submitted.attempt.id, rating: "good" });
    expect(rv.created).toBe(true);

    // ── 9. 断言 LearningState 落库且 reviewCount=1、dueAt 在未来 ──
    const state = await prisma.learningState.findUnique({
      where: { userId_knowledgePointId: { userId: "u-mvp", knowledgePointId: kpMain } },
    });
    expect(state).not.toBeNull();
    expect(state!.reviewCount).toBe(1);
    expect(state!.dueAt.getTime()).toBeGreaterThan(STUDY_AT.getTime());
    // SessionItem 被 FinalizeReview 置 completed
    expect((await prisma.sessionItem.findUnique({ where: { id: sessionItemId } }))?.status).toBe("completed");
    // StudyDay 累计
    const day = await prisma.studyDay.findUnique({
      where: { userId_localDate: { userId: "u-mvp", localDate: LOCAL_DATE } },
    });
    expect(day?.reviewCount).toBe(1);

    // ── 10. CompletePlanItem → StudyPlanItem 变 completed ──
    const completeItem = new CompletePlanItem({ planRepo, uow });
    const doneItem = await completeItem.execute({ itemId: planItemId });
    expect(doneItem.status).toBe("completed");
    expect((await prisma.studyPlanItem.findUnique({ where: { id: planItemId } }))?.status).toBe("completed");

    // ── 11. GetUserProgress（此刻=学习时刻）──
    const progress = new GetUserProgress({
      learningStates: learningRepos.learningStates,
      reviewEvents: learningRepos.reviewEvents,
      knowledgePoints,
    });
    const nowProgress = await progress.execute({ userId: "u-mvp", subjectId, now: STUDY_AT });
    // coverage：2 个已发布，已学 1 个（kpUnseen 未学）
    expect(nowProgress.coverage.publishedTotal).toBe(2);
    expect(nowProgress.coverage.learnedCount).toBe(1);
    expect(nowProgress.reviewedCount).toBe(1);
    // good 的 dueAt 在未来 → 此刻 dueList 为空；刚学 good → 不薄弱
    expect(nowProgress.dueList).toHaveLength(0);
    expect(nowProgress.weakList).toHaveLength(0);
    expect(nowProgress.stabilityDistribution.total).toBe(1);

    // ── 12. GetUserProgress（未来时刻）：dueAt 已到期 → dueList 含该 KP ──
    const futureProgress = await progress.execute({ userId: "u-mvp", subjectId, now: FUTURE_NOW });
    expect(futureProgress.dueList.length).toBeGreaterThan(0);
    expect(futureProgress.dueList.some((d) => d.knowledgePointId === kpMain)).toBe(true);
  }, 30000);
});
