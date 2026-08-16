// 众包反馈 API 测试(FR-4.4,发现/修正分离:flag 无需答案 / correction 需候选值)
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = { contentSubmission: new Map() };
  let nextId = 1;
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          if (name === "contentSubmission") {
            return {
              count: vi.fn(async ({ where }: any) => {
                const rows = [...tables.contentSubmission.values()].filter((r) =>
                  where?.userId && where?.itemId && where?.type
                    ? r.userId === where.userId &&
                      r.itemId === where.itemId &&
                      r.type === where.type &&
                      r.status === where.status &&
                      (where.field ? r.field === where.field : true)
                    : false
                );
                return rows.length;
              }),
              create: vi.fn(async ({ data }: any) => {
                const row = {
                  id: nextId++,
                  ...data,
                  status: "pending",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                tables.contentSubmission.set(String(row.id), row);
                return row;
              }),
              findMany: vi.fn(async ({ where }: any) => {
                const rows = [...tables.contentSubmission.values()].filter((r) =>
                  where?.userId ? r.userId === where.userId : true
                );
                return rows;
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

import { POST, GET } from "@/app/api/feedback/submit/route";
import { getServerSession } from "next-auth";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

beforeEach(() => {
  tables.__tables.contentSubmission.clear();
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "user-1", email: "a@b.c" },
  } as any);
});

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://x/api/feedback/submit", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/feedback/submit - flag 标记(发现通道,无需答案)", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x" }));
    expect(res.status).toBe(401);
  });

  it("flag 无需 suggestedValue 即可提交(用户只要'觉得不对')", async () => {
    const res = await POST(
      makeReq({ subject: "herb", itemId: "h_huangqin", itemName: "黄芩", field: "functions", type: "flag" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.type).toBe("flag");
    expect(data.submission.suggestedValue).toBe("");
    const rows = [...tables.__tables.contentSubmission.values()];
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
  });

  it("flag 可带备注(为什么觉得不对)", async () => {
    const res = await POST(
      makeReq({
        subject: "herb",
        itemId: "h_huangqin",
        type: "flag",
        field: "indications",
        reason: "教材上主治没有'胎动不安',请复查",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.reason).toContain("复查");
  });

  it("非法 subject 返回 400", async () => {
    const res = await POST(makeReq({ subject: "xxx", itemId: "h_x", type: "flag" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/feedback/submit - correction 修正(提供候选值)", () => {
  it("correction 必须填建议值,空值返回 400", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions" }));
    expect(res.status).toBe(400);
    const res2 = await POST(makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions", suggestedValue: "   " }));
    expect(res2.status).toBe(400);
  });

  it("correction 缺 field 返回 400", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x", type: "correction", suggestedValue: "y" }));
    expect(res.status).toBe(400);
  });

  it("suggestedValue 超长(>2000)返回 400", async () => {
    const res = await POST(
      makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions", suggestedValue: "a".repeat(2001) })
    );
    expect(res.status).toBe(400);
  });

  it("正常 correction 提交,pending 且带建议值", async () => {
    const res = await POST(
      makeReq({
        subject: "herb",
        itemId: "h_huangqin",
        itemName: "黄芩",
        type: "correction",
        field: "functions",
        fieldLabel: "功效",
        suggestedValue: "清热燥湿,泻火解毒,安胎",
        reason: "教材第X版表述不同",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.type).toBe("correction");
    expect(data.submission.suggestedValue).toContain("安胎");
    const rows = [...tables.__tables.contentSubmission.values()];
    expect(rows.length).toBe(1);
  });

  it("同条目同字段 pending 超过 3 条(按 type 各自计数)返回 429", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions", suggestedValue: `v${i}` })
      );
      expect(res.status).toBe(200);
    }
    const res = await POST(
      makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions", suggestedValue: "v4" })
    );
    expect(res.status).toBe(429);
  });

  it("flag 与 correction 防刷各自独立计数(flag 不影响 correction 提交)", async () => {
    // 3 条 flag 后,correction 仍可提交
    for (let i = 0; i < 3; i++) {
      await POST(makeReq({ subject: "herb", itemId: "h_x", type: "flag", field: "functions" }));
    }
    const res = await POST(
      makeReq({ subject: "herb", itemId: "h_x", type: "correction", field: "functions", suggestedValue: "ok" })
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/feedback/submit (我的提交)", () => {
  it("返回当前用户的提交历史(flag + correction)", async () => {
    tables.__tables.contentSubmission.set("1", {
      id: 1,
      userId: "user-1",
      subject: "herb",
      itemId: "h_x",
      itemName: "X",
      type: "correction",
      field: "functions",
      fieldLabel: "功效",
      suggestedValue: "yyy",
      reason: "",
      status: "pending",
      note: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submissions.length).toBe(1);
    expect(data.submissions[0].type).toBe("correction");
  });

  it("未登录 GET 返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
