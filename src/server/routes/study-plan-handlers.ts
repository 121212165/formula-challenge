/**
 * 学习计划路由（全部需要登录）。
 *
 *   GET  /api/study-plans/today                                  → 200 { localDate, plan, items[] }
 *   POST /api/study-plans/generate                               → 200 { plan, items[] }
 *   POST /api/study-plans/:id/items/:itemId/complete             → 200 { item }
 *   POST /api/study-plans/:id/items/:itemId/skip                 → 200 { item }
 *
 * complete/skip 先按 planId 校验归属（plan.userId === 当前用户，否则 403），再写条目。
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate } from "../auth";
import { readJson } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors";

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function toOptionalNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** GET /api/study-plans/today —— 按用户时区算 localDate 后取今日计划 */
export function getTodayPlanRoute(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const localDate = await c.getLocalDate(user.id, new Date());
    const result = await c.getTodayPlan.execute({ userId: user.id, localDate });
    return toJsonResponse({ localDate, ...result }, 200);
  };
}

/** POST /api/study-plans/generate —— 生成当日计划（已存在则幂等返回） */
export function postGeneratePlan(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const body = await readJson(req);
    const localDate = await c.getLocalDate(user.id, new Date());

    const result = await c.generateStudyPlan.execute({
      userId: user.id,
      localDate,
      subjectIds: toStringArray(body.subjectIds),
      newKnowledgePointIds: toStringArray(body.newKnowledgePointIds),
      maxReview: toOptionalNumber(body.maxReview),
      maxNew: toOptionalNumber(body.maxNew),
    });
    return toJsonResponse(result, 200);
  };
}

/** 归属守卫：plan 必须存在且属于当前用户。 */
async function assertPlanOwned(c: Container, planId: string, userId: string) {
  const plan = await c.planRepo.findById(planId);
  if (!plan) {
    throw new NotFoundError(`StudyPlan ${planId} 不存在`);
  }
  if (plan.userId !== userId) {
    throw new ForbiddenError("无权操作他人的 StudyPlan");
  }
}

/** POST /api/study-plans/:id/items/:itemId/complete */
export function postCompletePlanItem(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await authenticate(req, c.whoAmI);
    await assertPlanOwned(c, ctx.params.id!, user.id);
    const item = await c.completePlanItem.execute({ itemId: ctx.params.itemId! });
    return toJsonResponse({ item }, 200);
  };
}

/** POST /api/study-plans/:id/items/:itemId/skip */
export function postSkipPlanItem(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await authenticate(req, c.whoAmI);
    await assertPlanOwned(c, ctx.params.id!, user.id);
    const item = await c.skipPlanItem.execute({ itemId: ctx.params.itemId! });
    return toJsonResponse({ item }, 200);
  };
}
