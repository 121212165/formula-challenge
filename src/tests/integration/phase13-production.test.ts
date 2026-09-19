/**
 * Phase 13 生产加固验收测试 —— 结构化日志/requestId、健康检查、限流、审计、统一错误处理。
 *
 * 全部经 buildRouter 装配（生产运行时叠加），SQLite 真实库 + node:http。
 * 日志用内存 sink 断言；限流用独立紧阈值 router；未知错误用裸 ApiRouter 注入抛错路由。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { buildRouter, createContainer } from "@/server/index";
import { createServer } from "@/server/node-server";
import { ApiRouter } from "@/server/router";
import { createMemorySink, createStructuredLogger } from "@/server/production/logger";
import { createProductionRuntime } from "@/server/production/production";

const prisma: PrismaClient = getTestPrisma();

const R = Math.random().toString(36).slice(2, 8);
const subjectId = `subj-p13-${R}`;
const contentItemId = `ci-p13-${R}`;
const reporterEmail = `reporter-p13-${R}@example.com`;
const adminEmail = `admin-p13-${R}@example.com`;

// ── Router A：健康检查 + 日志 + 审计（默认限流阈值，不会在正常流程触发）──
let serverA: Server;
let baseA: string;
const sinkA = createMemorySink();

// ── Router B：限流专项（紧阈值 max=4）──
let serverB: Server;
let baseB: string;

async function apiOn(base: string, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
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
  return { status: res.status, body: json, headers: res.headers };
}

async function registerLogin(base: string, email: string): Promise<{ token: string; userId: string }> {
  await apiOn(base, "POST", "/api/auth/register", {
    body: { email, password: "long-enough-pw", timezone: "Asia/Shanghai" },
  });
  const login = await apiOn(base, "POST", "/api/auth/login", {
    body: { email, password: "long-enough-pw" },
  });
  const b = login.body as any;
  return { token: b.token as string, userId: b.user.id as string };
}

beforeAll(async () => {
  await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
  await prisma.contentItem.create({
    data: { id: contentItemId, subjectId, slug: `goutong-p13-${R}`, name: "桂枝汤", status: "published" },
  });

  // Router A：内存 sink + 默认限流
  const routerA = buildRouter(createContainer(prisma, { adminEmails: [adminEmail] }), {
    logger: createStructuredLogger(sinkA),
  });
  serverA = createServer(routerA);
  await new Promise<void>((resolve) => serverA.listen(0, "127.0.0.1", resolve));
  baseA = `http://127.0.0.1:${(serverA.address() as { port: number }).port}`;

  // Router B：紧阈值限流（窗口内 3 次；显式注入，不依赖全局 env）
  const sinkB = createMemorySink();
  const routerB = buildRouter(createContainer(prisma, { adminEmails: [adminEmail] }), {
    logger: createStructuredLogger(sinkB),
    rateLimit: { max: 3, windowMs: 60_000 },
  });
  serverB = createServer(routerB);
  await new Promise<void>((resolve) => serverB.listen(0, "127.0.0.1", resolve));
  baseB = `http://127.0.0.1:${(serverB.address() as { port: number }).port}`;
});

afterAll(async () => {
  serverA.close();
  serverB.close();
  await disconnectTestPrisma();
});

describe("Phase 13 生产加固", () => {
  it("1) 健康检查 GET /api/health 真实探测数据库（db up）", async () => {
    const res = await apiOn(baseA, "GET", "/api/health");
    expect(res.status).toBe(200);
    const b = res.body as any;
    expect(b.status).toBe("ok");
    expect(b.db).toBe("up");
    expect(typeof b.uptime).toBe("number");
    expect(typeof b.timestamp).toBe("string");
  });

  it("2) 关键接口结构化日志：requestId 透传/生成 + 响应头回写 + 字段齐全", async () => {
    const traceId = `trace-p13-${R}`;
    const reg = await apiOn(baseA, "POST", "/api/auth/register", {
      headers: { "x-request-id": traceId },
      body: { email: reporterEmail, password: "long-enough-pw", timezone: "Asia/Shanghai" },
    });
    expect(reg.status).toBe(201);
    // 响应头回写入站 requestId
    expect(reg.headers.get("x-request-id")).toBe(traceId);

    // 日志里有这条 register 的结构化记录
    const rec = sinkA.records.find(
      (r) => r.msg === "http.request" && r.requestId === traceId && r.method === "POST" && r.path === "/api/auth/register"
    );
    expect(rec).toBeDefined();
    expect(rec!.status).toBe(201);
    expect(typeof rec!.durationMs).toBe("number");
    // userId 由 handler 回填
    expect(rec!.userId).toBe((reg.body as any).user.id);

    // 不带 requestId 时服务端生成并回写
    const login = await apiOn(baseA, "POST", "/api/auth/login", {
      body: { email: reporterEmail, password: "long-enough-pw" },
    });
    expect(login.status).toBe(200);
    const generated = login.headers.get("x-request-id");
    expect(generated && generated.length > 0).toBe(true);
  });

  it("3) 审计：登录成功/失败都落 audit_logs，带 requestId", async () => {
    // 成功登录（带 requestId）
    const traceLogin = `trace-login-${R}`;
    const ok = await apiOn(baseA, "POST", "/api/auth/login", {
      headers: { "x-request-id": traceLogin },
      body: { email: reporterEmail, password: "long-enough-pw" },
    });
    expect(ok.status).toBe(200);

    // 失败登录（错误密码）
    const traceBad = `trace-bad-${R}`;
    const bad = await apiOn(baseA, "POST", "/api/auth/login", {
      headers: { "x-request-id": traceBad },
      body: { email: reporterEmail, password: "wrong-password" },
    });
    expect(bad.status).toBe(401);

    const rows = await prisma.auditLog.findMany({ where: { action: { in: ["LOGIN_SUCCESS", "LOGIN_FAILURE"] } } });
    const success = rows.find((r) => r.action === "LOGIN_SUCCESS" && r.requestId === traceLogin);
    const failure = rows.find((r) => r.action === "LOGIN_FAILURE" && r.requestId === traceBad);
    expect(success).toBeDefined();
    expect((success!.detail as any).email).toBe(reporterEmail);
    expect(success!.actorUserId).not.toBeNull();
    expect(failure).toBeDefined();
    expect((failure!.detail as any).email).toBe(reporterEmail);
    expect(failure!.actorUserId).toBeNull(); // 失败匿名
    expect(failure!.requestId).toBe(traceBad);
  });

  it("4) 审计：Issue 审核 accept 落 ISSUE_REVIEW + CONTENT_PUBLISH", async () => {
    const admin = await registerLogin(baseA, adminEmail);
    // 上报一个 issue
    const created = await apiOn(baseA, "POST", "/api/content-issues", {
      token: admin.token,
      body: { contentItemId, type: "incorrect", description: "组成有误" },
    });
    const issueId = (created.body as any).issue.id as string;

    const traceReview = `trace-review-${R}`;
    const review = await apiOn(baseA, "POST", `/api/admin/content-issues/${issueId}/review`, {
      token: admin.token,
      headers: { "x-request-id": traceReview },
      body: { decision: "accept", contentHash: `hash-${R}`, resolution: "已订正" },
    });
    expect(review.status).toBe(200);

    const issueReview = await prisma.auditLog.findFirst({
      where: { action: "ISSUE_REVIEW", targetId: issueId },
    });
    expect(issueReview).not.toBeNull();
    expect(issueReview!.requestId).toBe(traceReview);
    expect((issueReview!.detail as any).decision).toBe("accept");

    const publish = await prisma.auditLog.findFirst({
      where: { action: "CONTENT_PUBLISH", targetType: "ContentItem", targetId: contentItemId },
    });
    expect(publish).not.toBeNull();
  });

  it("5) 限流：连续打满受保护端点返回 429 + Retry-After", async () => {
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 8; i++) {
      const res = await apiOn(baseB, "POST", "/api/auth/login", {
        body: { email: `nobody-${R}@example.com`, password: "x" },
      });
      statuses.push(res.status);
      if (res.status === 429) {
        retryAfter = res.headers.get("retry-after");
      }
    }
    // 前 3 次（max=3）放行（凭据错误 → 401），其后被限流 → 429
    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(3).every((s) => s === 429)).toBe(true);
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("6) 统一错误处理：未知错误 500 且响应不含堆栈，带 requestId", async () => {
    const sink = createMemorySink();
    const rt = createProductionRuntime({ logger: createStructuredLogger(sink) });
    const r = new ApiRouter({ production: rt });
    r.register({
      method: "GET",
      pattern: "/boom",
      handler: async () => {
        throw new Error("kaboom-secret-stack");
      },
    });
    const res = await r.dispatch(
      new Request("http://x/boom", { headers: { "x-request-id": "boom-trace-1" } })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("kaboom-secret-stack");
    expect(res.headers.get("x-request-id")).toBe("boom-trace-1");
    // 服务端日志记录了堆栈
    const errLog = sink.records.find((x) => x.msg === "http.unhandled_error");
    expect(errLog).toBeDefined();
    expect(String(errLog!.stack)).toContain("kaboom-secret-stack");
  });

  it("7) 业务错误状态码正确（401），响应契约不变", async () => {
    const res = await apiOn(baseA, "GET", "/api/me");
    expect(res.status).toBe(401);
    const body = res.body as any;
    expect(body.error.code).toBeDefined();
    // requestId 仍回写
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
