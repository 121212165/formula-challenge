/**
 * 进度读模型路由（全部需要登录；subjectId 由 query 传入）。
 *
 *   GET /api/progress?subjectId=        → 200 完整进度读模型
 *   GET /api/progress/due?subjectId=    → 200 { dueList[] }
 *   GET /api/progress/weaknesses?subjectId= → 200 { weakList[] }
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate } from "../auth";
import { queryParam } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { ValidationError } from "@/shared/errors";

function requireSubjectId(req: Request): string {
  const subjectId = queryParam(req, "subjectId");
  if (!subjectId) {
    throw new ValidationError("缺少 query 参数：subjectId");
  }
  return subjectId;
}

/** GET /api/progress?subjectId= */
export function getProgress(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const subjectId = requireSubjectId(req);
    const result = await c.getUserProgress.execute({ userId: user.id, subjectId });
    return toJsonResponse(result, 200);
  };
}

/** GET /api/progress/due?subjectId= —— 只读 dueList */
export function getProgressDue(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const subjectId = requireSubjectId(req);
    const result = await c.getUserProgress.execute({ userId: user.id, subjectId });
    return toJsonResponse({ dueList: result.dueList }, 200);
  };
}

/** GET /api/progress/weaknesses?subjectId= —— 只读 weakList */
export function getProgressWeaknesses(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    const subjectId = requireSubjectId(req);
    const result = await c.getUserProgress.execute({ userId: user.id, subjectId });
    return toJsonResponse({ weakList: result.weakList }, 200);
  };
}
