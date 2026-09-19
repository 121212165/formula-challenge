/**
 * Phase 12 HTTP 闭环测试 —— 三条治理路由（真实 node:http + fetch，SQLite）。
 *
 * 闭环：
 *   - 用户 A 注册/登录 → POST /api/content-issues 上报（201）；
 *   - 管理员注册/登录 → GET /api/admin/content-issues 看到待审（200）；
 *   - 管理员 POST /api/admin/content-issues/:id/review?decision=accept（200）→ accepted；
 *   - 重复 review → 200 且 idempotent=true。
 *
 * 鉴权约定（对齐 api-http-loop.test.ts）：
 *   - 无 token 访问受保护端点 → 401；
 *   - 非管理员访问 admin 路由 → 403（ForbiddenError）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { buildRouter, createContainer } from "@/server/index";
import { createServer } from "@/server/node-server";

const prisma: PrismaClient = getTestPrisma();

const R = Math.random().toString(36).slice(2, 8);
const subjectId = `subj-issue-http-${R}`;
const contentItemId = `ci-issue-http-${R}`;
const reporterEmail = `reporter-${R}@example.com`;
const adminEmail = `admin-${R}@example.com`;
const outsiderEmail = `outsider-${R}@example.com`;

let server: Server;
let baseUrl: string;

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function registerLogin(email: string): Promise<{ token: string; userId: string }> {
  await api("POST", "/api/auth/register", {
    body: { email, password: "long-enough-pw", timezone: "Asia/Shanghai" },
  });
  const login = await api("POST", "/api/auth/login", { body: { email, password: "long-enough-pw" } });
  const b = login.body as any;
  return { token: b.token as string, userId: b.user.id as string };
}

beforeAll(async () => {
  // 内容侧种子：科目 + 已发布内容项
  await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
  await prisma.contentItem.create({
    data: { id: contentItemId, subjectId, slug: `sini-issue-http-${R}`, name: "四逆汤", status: "published" },
  });

  // 容器显式注入管理员邮箱白名单 → 装配 router → node:http 真实服务
  const router = buildRouter(createContainer(prisma, { adminEmails: [adminEmail] }));
  server = createServer(router);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  server.close();
  await disconnectTestPrisma();
});

describe("Phase 12 内容治理 HTTP 闭环", () => {
  it("上报→审核列表→接受→幂等，逐端点断言状态码", async () => {
    const reporter = await registerLogin(reporterEmail);
    const admin = await registerLogin(adminEmail);

    // 1. 登录用户上报内容问题 → 201
    const created = await api("POST", "/api/content-issues", {
      token: reporter.token,
      body: { contentItemId, type: "incorrect", description: "组成描述有误" },
    });
    expect(created.status).toBe(201);
    const issueId = (created.body as any).issue.id as string;
    expect((created.body as any).issue.status).toBe("pending");

    // 2. 管理员看到待审列表
    const list = await api("GET", `/api/admin/content-issues?status=pending`, {
      token: admin.token,
    });
    expect(list.status).toBe(200);
    const listIds = ((list.body as any).issues as any[]).map((i) => i.id);
    expect(listIds).toContain(issueId);

    // 3. 管理员接受（提供 contentHash）→ 200 accepted
    const review = await api("POST", `/api/admin/content-issues/${issueId}/review`, {
      token: admin.token,
      body: { decision: "accept", contentHash: "hash-http", resolution: "已订正" },
    });
    expect(review.status).toBe(200);
    expect((review.body as any).issue.status).toBe("accepted");
    expect((review.body as any).idempotent).toBe(false);

    // 4. 重复审核 → 200 且 idempotent=true（不再建版本）
    const again = await api("POST", `/api/admin/content-issues/${issueId}/review`, {
      token: admin.token,
      body: { decision: "accept", contentHash: "hash-http-2" },
    });
    expect(again.status).toBe(200);
    expect((again.body as any).idempotent).toBe(true);
  });

  it("鉴权：无 token 401 / 非管理员访问 admin 路由 403", async () => {
    // 无 token → 401
    const noAuth = await api("POST", "/api/content-issues", {
      body: { contentItemId, type: "other", description: "x" },
    });
    expect(noAuth.status).toBe(401);

    // 普通登录用户（非白名单）访问 admin 列表 → 403
    const outsider = await registerLogin(outsiderEmail);
    const forbidden = await api("GET", "/api/admin/content-issues", { token: outsider.token });
    expect(forbidden.status).toBe(403);

    // 非管理员提交审核 → 403
    const reviewForbidden = await api(
      "POST",
      `/api/admin/content-issues/any-id/review`,
      { token: outsider.token, body: { decision: "reject" } }
    );
    expect(reviewForbidden.status).toBe(403);
  });
});
