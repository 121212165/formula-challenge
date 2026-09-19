/**
 * 科目 / 内容只读路由（全部需要登录）。
 *
 *   GET /api/subjects                          → 200 { subjects[] }（enabled）
 *   GET /api/content?subjectId=                → 200 { content[] }（published，可按科目过滤）
 *   GET /api/content/:id                       → 200 { content }
 *   GET /api/content/:id/knowledge-points      → 200 { knowledgePoints[] }（该 content 下 published）
 *
 * 本层不直接 import prisma；subject/content 行读取走 container.queries，KP 走 knowledgePoints 仓储。
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate } from "../auth";
import { queryParam } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { NotFoundError } from "@/shared/errors";

/** GET /api/subjects */
export function getSubjects(c: Container): ApiHandler {
  return async (req) => {
    await authenticate(req, c.whoAmI);
    const subjects = await c.queries.listEnabledSubjects();
    return toJsonResponse({ subjects }, 200);
  };
}

/** GET /api/content?subjectId= */
export function getContentList(c: Container): ApiHandler {
  return async (req) => {
    await authenticate(req, c.whoAmI);
    const subjectId = queryParam(req, "subjectId") ?? undefined;
    const content = await c.queries.listPublishedContent(subjectId);
    return toJsonResponse({ content }, 200);
  };
}

/** GET /api/content/:id */
export function getContentItem(c: Container): ApiHandler {
  return async (req, ctx) => {
    await authenticate(req, c.whoAmI);
    const content = await c.queries.findContentItem(ctx.params.id!);
    if (!content) {
      throw new NotFoundError(`ContentItem ${ctx.params.id} 不存在`);
    }
    return toJsonResponse({ content }, 200);
  };
}

/** GET /api/content/:id/knowledge-points */
export function getContentKnowledgePoints(c: Container): ApiHandler {
  return async (req, ctx) => {
    await authenticate(req, c.whoAmI);
    const content = await c.queries.findContentItem(ctx.params.id!);
    if (!content) {
      throw new NotFoundError(`ContentItem ${ctx.params.id} 不存在`);
    }
    const knowledgePoints = await c.knowledgePoints.findPublishedByContentItem(content.id);
    return toJsonResponse({ knowledgePoints }, 200);
  };
}
