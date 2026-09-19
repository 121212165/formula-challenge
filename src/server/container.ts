/**
 * 组合根（Composition Root）—— Phase 8 HTTP API 层。
 *
 * 唯一知道 Prisma 的地方：用注入的 PrismaClient（生产走默认单例，测试传 getTestPrisma）
 * 装配全部领域用例 / 仓储 / 查询函数，对外只暴露不感知 Prisma 的接口。
 * 路由 handler 一律从这里取依赖，绝不直接 import @prisma/client。
 *
 * 装配范式照抄 src/tests/integration/mvp-e2e-loop.test.ts（createPrismaIdentityRepos /
 * createPrismaLearningRepos / PrismaQuestionRepository / PrismaKnowledgePointRepository /
 * PrismaStudyPlanRepository / PrismaUnitOfWork / FsrsScheduler / ScryptPasswordHasher /
 * buildDefaultQuestionRegistry）。
 */
import type { PrismaClient } from "@prisma/client";

// 生产默认 Prisma 单例（仅在未显式注入 prisma 时使用）。测试经 getTestPrisma 注入 SQLite。
import { prisma as defaultPrisma } from "@/shared/infrastructure/prisma-client";
import { PrismaUnitOfWork } from "@/shared/infrastructure/prisma-unit-of-work";
import { createGetLocalDate } from "@/shared/infrastructure/timezone";

import { createPrismaIdentityRepos } from "@/modules/identity/infrastructure/prisma-identity-repos";
import type { IdentityRepositories } from "@/modules/identity/domain/repositories";
import { ScryptPasswordHasher } from "@/modules/identity/infrastructure/scrypt-password-hasher";
import { RegisterUser } from "@/modules/identity/application/register-user";
import { LoginUser } from "@/modules/identity/application/login-user";
import { LogoutSession } from "@/modules/identity/application/logout-session";
import { WhoAmI } from "@/modules/identity/application/whoami";

import { createPrismaLearningRepos } from "@/modules/learning/infrastructure";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import { StartStudySession } from "@/modules/learning/application/start-study-session";
import { NextSessionItem } from "@/modules/learning/application/next-session-item";
import { SubmitAttempt } from "@/modules/learning/application/submit-attempt";
import { EvaluateAttempt } from "@/modules/learning/application/evaluate-attempt";
import { FinalizeReview } from "@/modules/learning/application/finalize-review";
import { GetUserProgress } from "@/modules/learning/application/get-user-progress";

import { GenerateQuestion } from "@/modules/question/application/generate-question";
import { buildDefaultQuestionRegistry } from "@/modules/question/domain/registry";
import { FormulaEvaluator } from "@/modules/question/application/subject-evaluators";
import { PrismaQuestionRepository } from "@/modules/question/infrastructure/prisma-question-repository";

import { PrismaKnowledgePointRepository } from "@/modules/knowledge/infrastructure/prisma-knowledge-point-repository";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";

import { PrismaStudyPlanRepository } from "@/modules/study-plan/infrastructure/prisma-study-plan-repository";
import type { StudyPlanRepository } from "@/modules/study-plan/domain/study-plan-repository";
import { GenerateStudyPlan } from "@/modules/study-plan/application/generate-study-plan";
import { GetTodayPlan, CompletePlanItem } from "@/modules/study-plan/application/today-plan";
import { SkipPlanItem } from "@/modules/study-plan/application/skip-plan-item";

// ── 内容治理（Phase 12）──
import { createPrismaContentRepos } from "@/modules/content/infrastructure/prisma-content-repository-factory";
import { createGovernanceRepos } from "@/modules/governance/infrastructure/prisma-governance-repos";
import type { GovernanceRepositories } from "@/modules/governance/domain/repositories";
import { CreateContentIssue } from "@/modules/governance/application/create-content-issue";
import { ReviewContentIssue } from "@/modules/governance/application/review-content-issue";
import { PrismaAuditLogRepository, type AuditLogger } from "./audit/audit-log";

/** 内容/科目只读查询（组合根内直连 prisma；handler 不感知 prisma）。 */
export interface ContentQueries {
  listEnabledSubjects(): Promise<
    Array<{ id: string; code: string; name: string; description: string }>
  >;
  listPublishedContent(subjectId?: string): Promise<
    Array<{ id: string; subjectId: string; slug: string; name: string; status: string }>
  >;
  findContentItem(id: string): Promise<
    { id: string; subjectId: string; slug: string; name: string; status: string } | null
  >;
}

/** 整个 HTTP 层的依赖图：用例 + 仓储读口 + 内容查询 + 时区工具。 */
export interface Container {
  // 身份
  registerUser: RegisterUser;
  loginUser: LoginUser;
  logoutSession: LogoutSession;
  whoAmI: WhoAmI;
  identityRepos: IdentityRepositories;
  // 学习
  startStudySession: StartStudySession;
  nextSessionItem: NextSessionItem;
  generateQuestion: GenerateQuestion;
  submitAttempt: SubmitAttempt;
  evaluateAttempt: EvaluateAttempt;
  finalizeReview: FinalizeReview;
  getUserProgress: GetUserProgress;
  learningRepos: LearningRepositories;
  // 计划
  generateStudyPlan: GenerateStudyPlan;
  getTodayPlan: GetTodayPlan;
  completePlanItem: CompletePlanItem;
  skipPlanItem: SkipPlanItem;
  planRepo: StudyPlanRepository;
  // 知识点读口（content 详情 / KP 列表）
  knowledgePoints: KnowledgePointRepository;
  // 内容只读查询
  queries: ContentQueries;
  // 按用户时区算本地日期
  getLocalDate: (userId: string, now: Date) => Promise<string>;
  // ── 内容治理（Phase 12）──
  /** 登录用户上报内容问题 */
  createContentIssue: CreateContentIssue;
  /** 审核员处理 Issue（accept 修订闭环 / reject） */
  reviewContentIssue: ReviewContentIssue;
  /** 治理仓储读口（审核工作台列表等） */
  governanceRepos: GovernanceRepositories;
  /** 判定某邮箱是否为内容审核管理员（admin 路由 403 用） */
  isAdminEmail: (email: string) => boolean;
  // ── Phase 13 生产加固 ──
  /** 审计日志端口（登录成功/失败、Issue 审核、内容发布） */
  auditLog: AuditLogger;
  /** 轻量数据库连通探测（健康检查用）；失败 reject */
  pingDb: () => Promise<void>;
}

/**
 * 装配容器。默认用生产 PrismaClient 单例；测试传入 getTestPrisma() 以共用同一 SQLite。
 * 用例的 idGen / now 全部走默认（crypto.randomUUID + 真实时钟）——HTTP 层不做时间冻结。
 *
 * @param adminEmails 内容审核管理员邮箱白名单（admin 路由 403 判定用）；
 *   缺省时读环境变量 ADMIN_EMAILS（逗号分隔）。数据模型暂无角色字段，
 *   故用邮箱白名单做最小化管理员网关（与既有 ForbiddenError→403 约定一致）。
 */
export function createContainer(
  prisma: PrismaClient = defaultPrisma,
  opts: { adminEmails?: Iterable<string> } = {}
): Container {
  // ── 仓储 / UoW ──
  const identityRepos = createPrismaIdentityRepos(prisma);
  const learningRepos = createPrismaLearningRepos(prisma);
  const questions = new PrismaQuestionRepository(prisma);
  const knowledgePoints = new PrismaKnowledgePointRepository(prisma);
  const planRepo = new PrismaStudyPlanRepository(prisma);
  // 内容治理所需的内容仓储（contentItems / contentVersions）+ Issue 仓储
  const contentRepos = createPrismaContentRepos(prisma);
  const governanceRepos = createGovernanceRepos(prisma);
  const uow = new PrismaUnitOfWork({ prisma });
  const hasher = new ScryptPasswordHasher();
  const scheduler = new FsrsScheduler();
  const registry = buildDefaultQuestionRegistry();

  // Phase 13：审计仓储（getClient 取 tx，事务内调用时与主业务同物理事务）。
  const auditLog: AuditLogger = new PrismaAuditLogRepository(prisma);
  // Phase 13：健康检查数据库连通探测（SQLite/PG 通用轻量 SELECT 1）。
  const pingDb = async (): Promise<void> => {
    await prisma.$queryRaw`SELECT 1`;
  };

  // 按用户时区算本地日期（BR-061 / BR-093）
  const getLocalDate = createGetLocalDate({ users: identityRepos.users });

  // 内容审核管理员邮箱白名单（显式传入优先，否则读环境变量 ADMIN_EMAILS）
  const adminEmailSet = new Set<string>(
    opts.adminEmails ??
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
  );
  const isAdminEmail = (email: string): boolean => adminEmailSet.has(email.trim().toLowerCase());

  // GenerateStudyPlan 的 profileReader 适配：读 dailyItemTarget，读不到回退 10
  const profileReader = {
    async getDailyItemTarget(userId: string): Promise<number> {
      const p = await identityRepos.profiles.findByUserId(userId);
      return p && Number.isFinite(p.dailyItemTarget) && p.dailyItemTarget > 0
        ? p.dailyItemTarget
        : 10;
    },
  };
  // 启用科目读取：subjectPrefs 里 enabled=true 的科目 id
  const enabledSubjectsReader = {
    async listEnabledSubjectIds(userId: string): Promise<string[]> {
      const prefs = await identityRepos.subjectPrefs.findByUserId(userId);
      return prefs.filter((p) => p.enabled).map((p) => p.subjectId);
    },
  };

  // ── 内容只读查询（唯一允许碰 prisma 的查询口） ──
  const queries: ContentQueries = {
    async listEnabledSubjects() {
      const rows = await prisma.subject.findMany({
        where: { enabled: true },
        select: { id: true, code: true, name: true, description: true },
      });
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
      }));
    },
    async listPublishedContent(subjectId?: string) {
      const rows = await prisma.contentItem.findMany({
        where: { status: "published", ...(subjectId ? { subjectId } : {}) },
        orderBy: { sortOrder: "asc" },
        select: { id: true, subjectId: true, slug: true, name: true, status: true },
      });
      return rows.map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        slug: r.slug,
        name: r.name,
        status: r.status,
      }));
    },
    async findContentItem(id: string) {
      const r = await prisma.contentItem.findUnique({
        where: { id },
        select: { id: true, subjectId: true, slug: true, name: true, status: true },
      });
      return r
        ? { id: r.id, subjectId: r.subjectId, slug: r.slug, name: r.name, status: r.status }
        : null;
    },
  };

  return {
    // 身份
    registerUser: new RegisterUser({ repos: identityRepos, hasher, uow }),
    loginUser: new LoginUser({ repos: identityRepos, hasher, uow, auditLog }), // 传 uow 才发会话 token
    logoutSession: new LogoutSession({ repos: identityRepos, uow }),
    whoAmI: new WhoAmI({ repos: identityRepos }),
    identityRepos,
    // 学习
    startStudySession: new StartStudySession({
      repos: learningRepos,
      knowledgePoints,
      uow,
    }),
    nextSessionItem: new NextSessionItem({ repos: learningRepos, uow }),
    generateQuestion: new GenerateQuestion({
      questions,
      knowledgePoints,
      sessionItems: learningRepos.sessionItems,
      uow,
      registry,
    }),
    submitAttempt: new SubmitAttempt({
      repos: learningRepos,
      questions,
      knowledgePoints,
      uow,
    }),
    evaluateAttempt: new EvaluateAttempt({
      repos: learningRepos,
      knowledgePoints,
      questions,
      evaluator: new FormulaEvaluator(),
      uow,
    }),
    finalizeReview: new FinalizeReview({
      repos: learningRepos,
      uow,
      scheduler,
      getLocalDate,
    }),
    getUserProgress: new GetUserProgress({
      learningStates: learningRepos.learningStates,
      reviewEvents: learningRepos.reviewEvents,
      knowledgePoints,
    }),
    learningRepos,
    // 计划
    generateStudyPlan: new GenerateStudyPlan({
      planRepo,
      learningRepos,
      uow,
      knowledgePoints,
      profileReader,
      enabledSubjectsReader,
    }),
    getTodayPlan: new GetTodayPlan({ planRepo }),
    completePlanItem: new CompletePlanItem({ planRepo, uow }),
    skipPlanItem: new SkipPlanItem({ planRepo, uow }),
    planRepo,
    knowledgePoints,
    queries,
    getLocalDate,
    // 内容治理（Phase 12）
    createContentIssue: new CreateContentIssue({
      contentItems: contentRepos.contentItems,
      contentIssues: governanceRepos.contentIssues,
      uow,
    }),
    reviewContentIssue: new ReviewContentIssue({
      contentItems: contentRepos.contentItems,
      contentVersions: contentRepos.contentVersions,
      contentIssues: governanceRepos.contentIssues,
      uow,
      auditLog,
    }),
    governanceRepos,
    isAdminEmail,
    // Phase 13 生产加固
    auditLog,
    pingDb,
  };
}
