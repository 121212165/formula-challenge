// AI 对话 API 测试(FR-4.2:激活 AiConversation 表;每日 20 问限流 + 三重防线)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock LLM 客户端
vi.mock("@/lib/deepseek", () => ({
  callDeepSeek: vi.fn(),
  isDeepSeekConfigured: vi.fn(() => true),
}));

// mock 会话
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// mock db
vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = {
    aiConversation: new Map(),
    herb: new Map(),
    formula: new Map(),
    acupoint: new Map(),
  };
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          if (name === "herb" || name === "formula" || name === "acupoint") {
            return {
              findUnique: vi.fn(async ({ where }: any) => tables[name].get(where.id) ?? null),
            };
          }
          if (name === "aiConversation") {
            return {
              findMany: vi.fn(async ({ where }: any) => {
                const rows = [...tables.aiConversation.values()].filter((c) =>
                  c.userId === where?.userId
                );
                return rows;
              }),
              findFirst: vi.fn(async ({ where }: any) => {
                for (const c of tables.aiConversation.values()) {
                  if (c.userId === where.userId && c.subject === where.subject) return c;
                }
                return null;
              }),
              create: vi.fn(async ({ data }: any) => {
                const row = {
                  id: 1,
                  ...data,
                  messageCount: data.messageCount ?? 0,
                  totalTokens: data.totalTokens ?? 0,
                };
                tables.aiConversation.set(`${data.userId}-${data.subject}`, row);
                return row;
              }),
              update: vi.fn(async ({ where, data }: any) => {
                const row = [...tables.aiConversation.values()].find(
                  (c) => c.id === where.id
                );
                Object.assign(row, data);
                return row;
              }),
            };
          }
          throw new Error(`unexpected table: ${name}`);
        },
      }
    ),
    __tables: tables,
  };
});

import { POST } from "@/app/api/ai/conversation/route";
import { getServerSession } from "next-auth";
import { callDeepSeek } from "@/lib/deepseek";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

beforeEach(() => {
  tables.__tables.aiConversation.clear();
  tables.__tables.herb.clear();
  tables.__tables.herb.set("h_huangqin", {
    id: "h_huangqin",
    name: "黄芩",
    functions: "清热燥湿,泻火解毒,止血,安胎",
    indications: "湿温暑湿,肺热咳嗽",
    property: "苦,寒",
    meridian: "肺、胆、脾、大肠、小肠",
  });
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "user-1", email: "a@b.c" },
  } as any);
  vi.mocked(callDeepSeek).mockResolvedValue({
    content: "黄芩性味苦寒,归肺胆经,功效清热燥湿、泻火解毒。",
    tokensUsed: 30,
    provider: "stepfun",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function makeReq(body: unknown): Request {
  return new Request("http://x/api/ai/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/conversation", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "黄芩功效?" }));
    expect(res.status).toBe(401);
  });

  it("缺少 question 返回 400", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_huangqin" }));
    expect(res.status).toBe(400);
  });

  it("非法 subject 返回 400", async () => {
    const res = await POST(makeReq({ subject: "xxx", itemId: "h_huangqin", question: "?" }));
    expect(res.status).toBe(400);
  });

  it("条目不存在返回 404", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_notexist", question: "?" }));
    expect(res.status).toBe(404);
  });

  it("正常提问返回 AI 回复(带免责尾注)并持久化", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "黄芩的功效?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("清热燥湿");
    expect(data.reply).toContain("不构成医疗建议");
    expect(data.quotaLeft).toBe(19);
    // 持久化检查
    const convo = [...tables.__tables.aiConversation.values()][0];
    expect(convo.messageCount).toBe(2); // user + assistant
    expect(convo.totalTokens).toBeGreaterThan(0);
  });

  it("每日第 21 问返回 429", async () => {
    // 预置 20 问(每问 2 条 message → 40 条)模拟今日已问 20 次
    const now = Date.now();
    tables.__tables.aiConversation.set("user-1-herb", {
      id: 1,
      userId: "user-1",
      subject: "herb",
      messages: "[]",
      messageCount: 40,
      totalTokens: 1200,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    const res = await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "?" }));
    expect(res.status).toBe(429);
  });

  it("AI 回复越界(含诊疗建议)被拦截并降级", async () => {
    vi.mocked(callDeepSeek).mockResolvedValue({
      content: "你有炎症,建议服用黄芩每日三次。",
      tokensUsed: 20,
      provider: "stepfun",
    });
    const res = await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "怎么治?" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // 越界 → 降级文案,不透传危险内容
    expect(data.reply).not.toContain("建议服用");
    expect(data.safe).toBe(false);
  });

  it("多轮上下文:第二次提问带上一次历史", async () => {
    await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "第一问" }));
    vi.mocked(callDeepSeek).mockClear();
    await POST(makeReq({ subject: "herb", itemId: "h_huangqin", question: "第二问" }));
    // 第二次调用时 messages 应含 4 条(system + 历史 2 + 条目上下文 + 当前问题)
    const [messages] = vi.mocked(callDeepSeek).mock.calls[0];
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });
});
