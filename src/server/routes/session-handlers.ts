/**
 * 学习会话 / 作答路由（全部需要登录；userId 一律来自鉴权，不信任 body）。
 *
 *   POST /api/sessions                                  → 201 { session, items[] }
 *   POST /api/sessions/:id/items                        → 200 { session, item, questionInstanceId }
 *   POST /api/sessions/:id/items/:itemId/question       → 200 { instance, question }
 *   POST /api/attempts                                  → 200 { created, attempt }（clientRequestId 幂等）
 *   POST /api/attempts/:id/review                       → 200 { evaluation, review }
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate } from "../auth";
import { requireString, readJson } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { setRequestUserId } from "../production/request-context";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import type { StudySessionMode } from "@/modules/learning/domain/session";
import type { ReviewRating } from "@/shared/types/rating";

const SESSION_MODES: readonly string[] = ["daily", "review", "free", "topic", "diagnostic"];
const RATINGS: readonly string[] = ["again", "hard", "good", "easy"];

/** POST /api/sessions —— 开始一次学习会话 */
export function postSessions(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const body = await readJson(req);
    const subjectId = requireString(body, "subjectId");

    const rawKps = body.knowledgePointIds;
    if (!Array.isArray(rawKps) || rawKps.some((k) => typeof k !== "string")) {
      throw new ValidationError("knowledgePointIds 必须是字符串数组");
    }
    const knowledgePointIds = rawKps as string[];

    let mode: StudySessionMode | undefined;
    if (typeof body.mode === "string" && SESSION_MODES.includes(body.mode)) {
      mode = body.mode as StudySessionMode;
    }

    const result = await c.startStudySession.execute({
      userId: user.id,
      subjectId,
      mode,
      knowledgePointIds,
    });
    return toJsonResponse(result, 201);
  };
}

/** POST /api/sessions/:id/items —— 激活并返回下一个 pending 项 */
export function postNextSessionItem(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await authenticate(req, c.whoAmI);
    const result = await c.nextSessionItem.execute({
      sessionId: ctx.params.id!,
      userId: user.id,
    });
    return toJsonResponse(result, 200);
  };
}

/** POST /api/sessions/:id/items/:itemId/question —— 为该 SessionItem 生成题目实例 */
export function postSessionItemQuestion(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await authenticate(req, c.whoAmI);
    const sessionId = ctx.params.id!;
    const sessionItemId = ctx.params.itemId!;
    const body = await readJson(req);

    // 取出 SessionItem 以推导 knowledgePointId，并校验归属（防越权给他人 session 出题）
    const sessionItem = await c.learningRepos.sessionItems.findById(sessionItemId);
    if (!sessionItem) {
      throw new NotFoundError(`SessionItem ${sessionItemId} 不存在`);
    }
    if (sessionItem.sessionId !== sessionId) {
      throw new NotFoundError(`SessionItem ${sessionItemId} 不属于 Session ${sessionId}`);
    }
    const session = await c.learningRepos.sessions.findById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session ${sessionId} 不存在`);
    }
    if (session.userId !== user.id) {
      throw new ForbiddenError("无权为他人的 Session 出题");
    }

    let type: string | undefined;
    if (typeof body.type === "string" && body.type.length > 0) {
      type = body.type;
    }

    const result = await c.generateQuestion.execute({
      sessionItemId,
      knowledgePointId: sessionItem.knowledgePointId,
      type: type as never,
    });
    return toJsonResponse(result, 200);
  };
}

/** POST /api/attempts —— 提交一次作答（clientRequestId 幂等） */
export function postAttempts(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    setRequestUserId(user.id);
    const body = await readJson(req);
    const sessionItemId = requireString(body, "sessionItemId");
    const userAnswer = requireString(body, "userAnswer");
    const clientRequestId = requireString(body, "clientRequestId");

    const startedAtRaw = body.startedAt;
    const startedAt =
      typeof startedAtRaw === "string" && startedAtRaw.length > 0
        ? new Date(startedAtRaw)
        : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      throw new ValidationError("startedAt 不是合法日期");
    }

    const result = await c.submitAttempt.execute({
      userId: user.id,
      sessionItemId,
      userAnswer,
      clientRequestId,
      startedAt,
    });
    return toJsonResponse(result, 200);
  };
}

/** POST /api/attempts/:id/review —— 系统评分后由用户评级 good/... */
export function postAttemptReview(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await authenticate(req, c.whoAmI);
    setRequestUserId(user.id);
    const attemptId = ctx.params.id!;
    const body = await readJson(req);
    const ratingRaw = requireString(body, "rating");
    if (!RATINGS.includes(ratingRaw)) {
      throw new ValidationError(`rating 必须是 ${RATINGS.join("/")} 之一`);
    }
    const rating = ratingRaw as ReviewRating;

    // 先系统评分（幂等），再用户评级（幂等）。归属校验由各用例状态机/查询保证。
    const evaluation = await c.evaluateAttempt.execute({ attemptId });
    const review = await c.finalizeReview.execute({ attemptId, rating });
    return toJsonResponse({ evaluation, review }, 200);
  };
}
