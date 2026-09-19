/**
 * Phase 8 验收：HTTP API 全闭环冒烟测试 —— 真实 node:http 起在随机端口，用全局 fetch 跑通。
 *
 * 闭环（A 用户）：
 *   register(201) → login(200 拿 token) → GET /api/me(200) →
 *   种子 content(科目/内容项/KP/模板) →
 *   POST /api/study-plans/generate → GET /api/study-plans/today →
 *   POST /api/sessions → POST next-item → POST question →
 *   POST /api/attempts → POST /api/attempts/:id/review(good) → GET /api/progress。
 *
 * 负向：
 *   - 无 token GET /api/me → 401；
 *   - B 用户访问 A 的 session / plan → 403；
 *   - 重复 clientRequestId POST /api/attempts → 200 且 created=false（幂等）。
 *
 * afterAll：关 server + disconnectTestPrisma。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { buildRouter, createContainer } from "@/server/index";
import { createServer } from "@/server/node-server";

const prisma: PrismaClient = getTestPrisma();

// 每个测试文件唯一前缀，避免与其它集成测试在同一 SQLite 库撞主键
const R = Math.random().toString(36).slice(2, 8);
const subjectId = `subj-http-${R}`;
const contentItemId = `ci-http-${R}`;
const kpMain = `kp-http-main-${R}`;
const kpUnseen = `kp-http-unseen-${R}`;
const kpType = `formula.http.${R}`;

let server: Server;
let baseUrl: string;

// 带 JSON body + 可选 Bearer 的 fetch 小助手
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

beforeAll(async () => {
  // 内容侧种子（照 mvp-e2e-loop.test.ts 第 57~83 行，直接用 prisma 落测试数据）
  await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
  await prisma.contentItem.create({
    data: { id: contentItemId, subjectId, slug: `mahuangtang-http-${R}`, name: "麻黄汤", status: "published" },
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
    data: { id: `tpl-http-${R}`, knowledgePointType: kpType, type: "free_recall", difficulty: 1 },
  });

  // 用测试 prisma 装配容器 → router → node:http 真实服务器（随机端口）
  const router = buildRouter(createContainer(prisma));
  server = createServer(router);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  server.close();
  await disconnectTestPrisma();
});

describe("Phase 8 HTTP API 全闭环冒烟（真实 node:http + fetch）", () => {
  it("注册→登录→/me→计划→Session→出题→作答→评分→复习→进度，逐端点断言状态码", async () => {
    // ── 1. 注册 A ──
    const emailA = `a-${R}@example.com`;
    const reg = await api("POST", "/api/auth/register", {
      body: { email: emailA, password: "long-enough-pw", timezone: "Asia/Shanghai", name: "阿甲" },
    });
    expect(reg.status).toBe(201);
    const regBody = reg.body as any;
    expect(regBody.user.email).toBe(emailA);
    expect(typeof regBody.verificationToken).toBe("string");
    const userIdA = regBody.user.id as string;

    // ── 2. 登录 A 拿 token ──
    const login = await api("POST", "/api/auth/login", {
      body: { email: emailA, password: "long-enough-pw" },
    });
    expect(login.status).toBe(200);
    const loginBody = login.body as any;
    expect(typeof loginBody.token).toBe("string");
    expect(loginBody.token.length).toBeGreaterThan(0);
    const tokenA = loginBody.token as string;

    // ── 3. GET /api/me ──
    const me = await api("GET", "/api/me", { token: tokenA });
    expect(me.status).toBe(200);
    expect((me.body as any).user.id).toBe(userIdA);

    // ── 3b. 内容只读端点 ──
    const subjects = await api("GET", "/api/subjects", { token: tokenA });
    expect(subjects.status).toBe(200);
    expect(((subjects.body as any).subjects as any[]).map((s) => s.id)).toContain(subjectId);

    const contentList = await api("GET", `/api/content?subjectId=${subjectId}`, { token: tokenA });
    expect(contentList.status).toBe(200);
    expect(((contentList.body as any).content as any[]).map((c) => c.id)).toContain(contentItemId);

    const kpList = await api("GET", `/api/content/${contentItemId}/knowledge-points`, { token: tokenA });
    expect(kpList.status).toBe(200);
    expect((kpList.body as any).knowledgePoints.length).toBe(2);

    // ── 4. 生成当日计划（自发现：传入 subjectIds）──
    const genPlan = await api("POST", "/api/study-plans/generate", {
      token: tokenA,
      body: { subjectIds: [subjectId] },
    });
    expect(genPlan.status).toBe(200);
    const genPlanBody = genPlan.body as any;
    expect(genPlanBody.plan.status).toBe("active");
    expect(genPlanBody.items.length).toBeGreaterThan(0);
    const planId = genPlanBody.plan.id as string;
    const planItemId = genPlanBody.items[0].id as string;

    // ── 5. GET 今日计划 ──
    const today = await api("GET", "/api/study-plans/today", { token: tokenA });
    expect(today.status).toBe(200);
    expect((today.body as any).plan.id).toBe(planId);

    // ── 6. 开始 Session ──
    const start = await api("POST", "/api/sessions", {
      token: tokenA,
      body: { subjectId, knowledgePointIds: [kpMain] },
    });
    expect(start.status).toBe(201);
    const startBody = start.body as any;
    expect(startBody.session.status).toBe("active");
    expect(startBody.items.length).toBe(1);
    const sessionId = startBody.session.id as string;
    const sessionItemId = startBody.items[0].id as string;

    // ── 7. 取下一项（激活 pending→active）──
    const next = await api("POST", `/api/sessions/${sessionId}/items`, { token: tokenA });
    expect(next.status).toBe(200);
    const nextBody = next.body as any;
    expect(nextBody.item.id).toBe(sessionItemId);
    expect(nextBody.item.status).toBe("active");

    // ── 8. 生成题目实例 ──
    const q = await api("POST", `/api/sessions/${sessionId}/items/${sessionItemId}/question`, {
      token: tokenA,
      body: { type: "free_recall" },
    });
    expect(q.status).toBe(200);
    const qBody = q.body as any;
    expect(qBody.instance.sessionItemId).toBe(sessionItemId);
    expect(qBody.question.kind).toBe("free_recall");

    // ── 9. 提交作答（正确答案）──
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const crId = `cr-http-${R}-1`;
    const attempt = await api("POST", "/api/attempts", {
      token: tokenA,
      body: {
        sessionItemId,
        userAnswer: "麻黄、桂枝、杏仁、甘草",
        clientRequestId: crId,
        startedAt,
      },
    });
    expect(attempt.status).toBe(200);
    const attemptBody = attempt.body as any;
    expect(attemptBody.created).toBe(true);
    expect(attemptBody.attempt.status).toBe("submitted");
    const attemptId = attemptBody.attempt.id as string;

    // ── 10. 评分 + 评级 good ──
    const review = await api("POST", `/api/attempts/${attemptId}/review`, {
      token: tokenA,
      body: { rating: "good" },
    });
    expect(review.status).toBe(200);
    expect((review.body as any).review.created).toBe(true);

    // ── 11. 进度读模型 ──
    const progress = await api("GET", `/api/progress?subjectId=${subjectId}`, { token: tokenA });
    expect(progress.status).toBe(200);
    expect((progress.body as any).reviewedCount).toBe(1);
    expect((progress.body as any).coverage.learnedCount).toBe(1);

    // ── 12. 完成计划条目（归属校验通过）──
    const done = await api("POST", `/api/study-plans/${planId}/items/${planItemId}/complete`, {
      token: tokenA,
    });
    expect(done.status).toBe(200);
    expect((done.body as any).item.status).toBe("completed");

    // 把跨用例需要的 id 挂到 globalThis 上供负向用例复用
    (globalThis as any).__httpLoop = { userIdA, tokenA, sessionId, planId, planItemId, crId, sessionItemId };
  });

  it("负向：未登录 401 / 越权 403 / clientRequestId 幂等 200 created=false", async () => {
    const ctx = (globalThis as any).__httpLoop as {
      userIdA: string;
      tokenA: string;
      sessionId: string;
      planId: string;
      planItemId: string;
      crId: string;
      sessionItemId: string;
    };

    // 无 token 访问受保护端点 → 401
    const noAuth = await api("GET", "/api/me");
    expect(noAuth.status).toBe(401);

    // B 用户注册 + 登录
    const emailB = `b-${R}@example.com`;
    await api("POST", "/api/auth/register", {
      body: { email: emailB, password: "long-enough-pw", timezone: "Asia/Shanghai" },
    });
    const loginB = await api("POST", "/api/auth/login", {
      body: { email: emailB, password: "long-enough-pw" },
    });
    expect(loginB.status).toBe(200);
    const tokenB = (loginB.body as any).token as string;

    // B 访问 A 的 session → 403
    const crossSession = await api("POST", `/api/sessions/${ctx.sessionId}/items`, { token: tokenB });
    expect(crossSession.status).toBe(403);

    // B 访问 A 的 plan 条目 → 403（归属校验）
    const crossPlan = await api(
      "POST",
      `/api/study-plans/${ctx.planId}/items/${ctx.planItemId}/complete`,
      { token: tokenB }
    );
    expect(crossPlan.status).toBe(403);

    // 重复 clientRequestId 提交同一作答 → 200 且 created=false（幂等）
    const dup = await api("POST", "/api/attempts", {
      token: ctx.tokenA,
      body: {
        sessionItemId: ctx.sessionItemId,
        userAnswer: "麻黄、桂枝、杏仁、甘草",
        clientRequestId: ctx.crId,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(dup.status).toBe(200);
    expect((dup.body as any).created).toBe(false);
  });
});
