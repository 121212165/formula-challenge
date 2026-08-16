// 众包纠错反馈 API 测试(FR-4.4)
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
                  where?.userId && where?.itemId && where?.field
                    ? r.userId === where.userId && r.itemId === where.itemId && r.field === where.field && r.status === where.status
                    : false
                );
                return rows.length;
              }),
              create: vi.fn(async ({ data }: any) => {
                const row = { id: nextId++, ...data, status: "pending", createdAt: new Date(), updatedAt: new Date() };
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

describe("POST /api/feedback/submit", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x", suggestedValue: "y" }));
    expect(res.status).toBe(401);
  });

  it("缺少必填字段返回 400", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x" }));
    expect(res.status).toBe(400);
  });

  it("非法 subject 返回 400", async () => {
    const res = await POST(makeReq({ subject: "xxx", itemId: "h_x", suggestedValue: "y" }));
    expect(res.status).toBe(400);
  });

  it("suggestedValue 超长(>2000)返回 400", async () => {
    const res = await POST(
      makeReq({ subject: "herb", itemId: "h_x", suggestedValue: "a".repeat(2001) })
    );
    expect(res.status).toBe(400);
  });

  it("正常提交返回 200,status=pending 并持久化", async () => {
    const res = await POST(
      makeReq({
        subject: "herb",
        itemId: "h_huangqin",
        itemName: "黄芩",
        field: "functions",
        fieldLabel: "功效",
        suggestedValue: "清热燥湿,泻火解毒,安胎",
        reason: "教材第X版表述不同",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.status).toBe("pending");
    expect(data.submission.subject).toBe("herb");
    expect(data.submission.userId).toBe("user-1");
    // 持久化
    const rows = [...tables.__tables.contentSubmission.values()];
    expect(rows.length).toBe(1);
    expect(rows[0].suggestedValue).toContain("安胎");
  });

  it("空 suggestedValue(纯空白)返回 400", async () => {
    const res = await POST(makeReq({ subject: "herb", itemId: "h_x", suggestedValue: "   " }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feedback/submit (我的提交)", () => {
  it("返回当前用户的提交历史", async () => {
    // 预置一条
    tables.__tables.contentSubmission.set("1", {
      id: 1,
      userId: "user-1",
      subject: "herb",
      itemId: "h_x",
      itemName: "X",
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
    expect(data.submissions[0].userId).toBe("user-1");
  });

  it("未登录 GET 返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
