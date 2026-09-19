/**
 * 路由装配入口 —— 把全部 handler 注册进一个 ApiRouter。
 *
 * 供两条路径复用：
 *   1. node:http 真实服务器（node-server.ts）；
 *   2. vitest 集成测试（直接构造 Request 调 dispatch，或经 node:http 起服务用 fetch）。
 *
 * 每个端点都是"公开用例 → 鉴权 → 领域用例 → JSON 响应"的薄适配层，不含业务规则。
 */
import { ApiRouter } from "./router";
import { createContainer, type Container } from "./container";

import {
  postRegister,
  postLogin,
  postLogout,
  getMe,
} from "./routes/auth-handlers";
import {
  getSubjects,
  getContentList,
  getContentItem,
  getContentKnowledgePoints,
} from "./routes/content-handlers";
import {
  postSessions,
  postNextSessionItem,
  postSessionItemQuestion,
  postAttempts,
  postAttemptReview,
} from "./routes/session-handlers";
import {
  getProgress,
  getProgressDue,
  getProgressWeaknesses,
} from "./routes/progress-handlers";
import {
  getTodayPlanRoute,
  postGeneratePlan,
  postCompletePlanItem,
  postSkipPlanItem,
} from "./routes/study-plan-handlers";
import {
  postContentIssue,
  getAdminContentIssues,
  postAdminReviewContentIssue,
} from "./routes/governance-handlers";
import { getHealth } from "./routes/health-handlers";
import { createProductionRuntime, type ProductionOptions } from "./production/production";

/**
 * 用给定容器（默认生产容器）装配一个注册好全部路由的 ApiRouter。
 *
 * Phase 13：默认叠加生产运行时（结构化日志 + requestId + 限流 + 错误处理）。
 * 测试可经 prodOptions 注入内存日志 sink / 限流阈值覆盖。
 */
export function buildRouter(
  container: Container = createContainer(),
  prodOptions: ProductionOptions = {}
): ApiRouter {
  const router = new ApiRouter({ production: createProductionRuntime(prodOptions) });

  // Phase 13：健康检查（不鉴权，真实探测数据库）
  router.register({ method: "GET", pattern: "/api/health", handler: getHealth(container) });

  // 认证
  router.register({ method: "POST", pattern: "/api/auth/register", handler: postRegister(container) });
  router.register({ method: "POST", pattern: "/api/auth/login", handler: postLogin(container) });
  router.register({ method: "POST", pattern: "/api/auth/logout", handler: postLogout(container) });
  router.register({ method: "GET", pattern: "/api/me", handler: getMe(container) });

  // 科目 / 内容
  router.register({ method: "GET", pattern: "/api/subjects", handler: getSubjects(container) });
  router.register({ method: "GET", pattern: "/api/content", handler: getContentList(container) });
  router.register({
    method: "GET",
    pattern: "/api/content/:id/knowledge-points",
    handler: getContentKnowledgePoints(container),
  });
  router.register({ method: "GET", pattern: "/api/content/:id", handler: getContentItem(container) });

  // 学习会话 / 作答
  router.register({ method: "POST", pattern: "/api/sessions", handler: postSessions(container) });
  router.register({
    method: "POST",
    pattern: "/api/sessions/:id/items",
    handler: postNextSessionItem(container),
  });
  router.register({
    method: "POST",
    pattern: "/api/sessions/:id/items/:itemId/question",
    handler: postSessionItemQuestion(container),
  });
  router.register({ method: "POST", pattern: "/api/attempts", handler: postAttempts(container) });
  router.register({
    method: "POST",
    pattern: "/api/attempts/:id/review",
    handler: postAttemptReview(container),
  });

  // 进度
  router.register({ method: "GET", pattern: "/api/progress", handler: getProgress(container) });
  router.register({
    method: "GET",
    pattern: "/api/progress/due",
    handler: getProgressDue(container),
  });
  router.register({
    method: "GET",
    pattern: "/api/progress/weaknesses",
    handler: getProgressWeaknesses(container),
  });

  // 学习计划
  router.register({
    method: "GET",
    pattern: "/api/study-plans/today",
    handler: getTodayPlanRoute(container),
  });
  router.register({
    method: "POST",
    pattern: "/api/study-plans/generate",
    handler: postGeneratePlan(container),
  });
  router.register({
    method: "POST",
    pattern: "/api/study-plans/:id/items/:itemId/complete",
    handler: postCompletePlanItem(container),
  });
  router.register({
    method: "POST",
    pattern: "/api/study-plans/:id/items/:itemId/skip",
    handler: postSkipPlanItem(container),
  });

  // 内容治理（Phase 12）
  router.register({
    method: "POST",
    pattern: "/api/content-issues",
    handler: postContentIssue(container),
  });
  router.register({
    method: "GET",
    pattern: "/api/admin/content-issues",
    handler: getAdminContentIssues(container),
  });
  router.register({
    method: "POST",
    pattern: "/api/admin/content-issues/:id/review",
    handler: postAdminReviewContentIssue(container),
  });

  return router;
}

export { createContainer };
export type { Container };
