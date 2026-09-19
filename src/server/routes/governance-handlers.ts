/**
 * 内容治理路由（Phase 12 / 架构文档 §32，BR-082）。
 *
 *   POST /api/content-issues                  → 201 { issue }（任何登录用户上报）
 *   GET  /api/admin/content-issues?status=     → 200 { issues[] }（审核工作台，admin）
 *   POST /api/admin/content-issues/:id/review  → 200 { issue, version?, item?, idempotent }（admin）
 *
 * admin 路由鉴权：先 authenticate 取登录用户，再用 container.isAdminEmail(email) 判定，
 * 非管理员抛 ForbiddenError（router 自动映射 403，与既有越权 403 约定一致）。
 * reporterId / reviewerId 一律来自鉴权用户，绝不信任 body。
 */
import type { Container } from "../container";
import type { ApiHandler } from "../router";
import { authenticate } from "../auth";
import { queryParam, readJson, requireString } from "../http-helpers";
import { toJsonResponse } from "../http-errors";
import { ForbiddenError, ValidationError } from "@/shared/errors";
import { setRequestUserId } from "../production/request-context";
import type {
  ContentIssueStatus,
  ContentIssueType,
} from "@/modules/governance/domain/content-issue";
import { CONTENT_ISSUE_TYPES } from "@/modules/governance/domain/content-issue";

const ISSUE_STATUSES: readonly ContentIssueStatus[] = [
  "pending",
  "reviewing",
  "accepted",
  "rejected",
];

/** admin 路由通用鉴权：未登录 → 401；登录但非管理员 → 403。 */
async function requireAdmin(req: Request, c: Container) {
  const { user } = await authenticate(req, c.whoAmI);
  if (!c.isAdminEmail(user.email)) {
    throw new ForbiddenError("仅内容审核管理员可访问");
  }
  return { user };
}

/** POST /api/content-issues —— 登录用户上报内容问题 */
export function postContentIssue(c: Container): ApiHandler {
  return async (req) => {
    const { user } = await authenticate(req, c.whoAmI);
    setRequestUserId(user.id);
    const body = await readJson(req);

    const contentItemId = requireString(body, "contentItemId");
    const description = requireString(body, "description");

    const typeRaw = body.type;
    if (typeof typeRaw !== "string" || !CONTENT_ISSUE_TYPES.includes(typeRaw as ContentIssueType)) {
      throw new ValidationError(`type 必须是 ${CONTENT_ISSUE_TYPES.join("/")} 之一`);
    }
    const type = typeRaw as ContentIssueType;

    const knowledgePointId =
      typeof body.knowledgePointId === "string" && body.knowledgePointId.length > 0
        ? body.knowledgePointId
        : undefined;

    const result = await c.createContentIssue.execute({
      reporterId: user.id,
      contentItemId,
      knowledgePointId,
      type,
      description,
    });
    return toJsonResponse(result, 201);
  };
}

/** GET /api/admin/content-issues?status= —— 审核工作台列表（admin，默认 pending） */
export function getAdminContentIssues(c: Container): ApiHandler {
  return async (req) => {
    await requireAdmin(req, c);

    const statusRaw = queryParam(req, "status") ?? "pending";
    if (!ISSUE_STATUSES.includes(statusRaw as ContentIssueStatus)) {
      throw new ValidationError(`status 必须是 ${ISSUE_STATUSES.join("/")} 之一`);
    }
    const status = statusRaw as ContentIssueStatus;

    const issues = await c.governanceRepos.contentIssues.findByStatus(status);
    return toJsonResponse({ issues }, 200);
  };
}

/** POST /api/admin/content-issues/:id/review —— 接受 / 拒绝（admin） */
export function postAdminReviewContentIssue(c: Container): ApiHandler {
  return async (req, ctx) => {
    const { user } = await requireAdmin(req, c);
    setRequestUserId(user.id);
    const body = await readJson(req);

    const decisionRaw = body.decision;
    if (decisionRaw !== "accept" && decisionRaw !== "reject") {
      throw new ValidationError("decision 必须是 accept 或 reject");
    }

    const resolution =
      typeof body.resolution === "string" && body.resolution.length > 0
        ? body.resolution
        : undefined;
    const sourceId =
      typeof body.sourceId === "string" && body.sourceId.length > 0
        ? body.sourceId
        : undefined;
    const contentHash =
      typeof body.contentHash === "string" && body.contentHash.length > 0
        ? body.contentHash
        : undefined;
    const createdBy =
      typeof body.createdBy === "string" && body.createdBy.length > 0
        ? body.createdBy
        : undefined;

    const result = await c.reviewContentIssue.execute({
      issueId: ctx.params.id!,
      reviewerId: user.id,
      decision: decisionRaw,
      resolution,
      sourceId,
      contentHash,
      createdBy,
    });
    return toJsonResponse(result, 200);
  };
}
