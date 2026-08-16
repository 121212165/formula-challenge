// 后台审核 API 测试(FR-4.4 后台闭环)
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = {
    contentSubmission: new Map(),
    herb: new Map(),
    acupoint: new Map(),
    formula: new Map(),
  };
  let nextId = 1;
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          if (name === "$transaction") {
            return vi.fn(async (ops: any[]) => {
              const results = [];
              for (const op of ops) results.push(await op);
              return results;
            });
          }
          if (name === "contentSubmission") {
            return {
              findMany: vi.fn(async ({ where }: any) => {
                let rows = [...tables.contentSubmission.values()];
                if (where?.status) rows = rows.filter((r) => r.status === where.status);
                return rows;
              }),
              findUnique: vi.fn(async ({ where }) => tables.contentSubmission.get(String(where.id)) ?? null),
              update: vi.fn(async ({ where, data }: any) => {
                const row = tables.contentSubmission.get(String(where.id));
                if (!row) throw new Error("not found");
                Object.assign(row, data);
                return row;
              }),
              groupBy: vi.fn(async ({ by, where, _count }: any) => {
                const rows = [...tables.contentSubmission.values()].filter((r) =>
                  where?.type ? r.type === where.type : true
                );
                const map = new Map<string, number>();
                for (const r of rows) map.set(r[by[0]], (map.get(r[by[0]]) ?? 0) + 1);
                return [...map.entries()].map(([itemId, n]) => ({ itemId, _count: { id: n } }));
              }),
              create: vi.fn(async ({ data }: any) => {
                const row = { id: nextId++, ...data, createdAt: new Date(), updatedAt: new Date() };
                tables.contentSubmission.set(String(row.id), row);
                return row;
              }),
            };
          }
          if (tables[name]) {
            return {
              findUnique: vi.fn(async ({ where }) => tables[name].get(where.id) ?? null),
              update: vi.fn(async ({ where, data }: any) => {
                const row = tables[name].get(where.id);
                if (!row) throw new Error("not found");
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

import { GET as listSubmissions } from "@/app/api/admin/submissions/route";
import { POST as review } from "@/app/api/admin/submissions/[id]/route";
import { getServerSession } from "next-auth";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

beforeEach(() => {
  tables.__tables.contentSubmission.clear();
  tables.__tables.herb.clear();
  tables.__tables.acupoint.clear();
  tables.__tables.formula.clear();
  // 管理员邮箱(读 env)
  vi.stubEnv("ADMIN_EMAILS", "admin@test.com");
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "user-admin", email: "admin@test.com" },
  } as any);
});

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://x/api/admin/submissions/1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function seedSubmission(partial: Partial<any> = {}) {
  const row = {
    id: 1,
    userId: "user-1",
    subject: "herb",
    itemId: "h_huangqin",
    itemName: "黄芩",
    type: "correction",
    field: "functions",
    fieldLabel: "功效",
    suggestedValue: "清热燥湿,泻火解毒,安胎",
    reason: "",
    status: "pending",
    note: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
  tables.__tables.contentSubmission.set(String(row.id), row);
  return row;
}

describe("GET /api/admin/submissions", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await listSubmissions(new Request("http://x/api/admin/submissions"));
    expect(res.status).toBe(401);
  });

  it("非管理员返回 403", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "user@x.com" } } as any);
    const res = await listSubmissions(new Request("http://x/api/admin/submissions"));
    expect(res.status).toBe(403);
  });

  it("管理员看到 pending 列表,correction 带 flagCount 信号", async () => {
    seedSubmission({ id: 1, type: "correction", itemId: "h_huangqin" });
    seedSubmission({ id: 2, type: "flag", itemId: "h_huangqin", status: "pending", field: "functions" });
    seedSubmission({ id: 3, type: "flag", itemId: "h_huangqin", status: "pending", field: "functions" });
    const res = await listSubmissions(new Request("http://x/api/admin/submissions?status=pending"));
    expect(res.status).toBe(200);
    const data = await res.json();
    const correction = data.submissions.find((s: any) => s.id === 1);
    expect(correction.flagCount).toBe(2); // 同条目 2 个 pending flag
  });
});

describe("POST /api/admin/submissions/[id]", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("非管理员返回 403", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "user@x.com" } } as any);
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(403);
  });

  it("非法 action 返回 400", async () => {
    seedSubmission();
    const res = await review(makeReq({ action: "banana" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(400);
  });

  it("approve correction:合入主数据 + 置 approved", async () => {
    seedSubmission({ field: "functions", suggestedValue: "清热燥湿,泻火解毒,安胎" });
    tables.__tables.herb.set("h_huangqin", {
      id: "h_huangqin",
      name: "黄芩",
      functions: "清热燥湿",
      property: "苦,寒",
      meridian: "肺",
    });
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.merged).toBe(true);
    // 主数据已更新
    expect(tables.__tables.herb.get("h_huangqin").functions).toContain("安胎");
    // submission 状态
    expect(tables.__tables.contentSubmission.get("1").status).toBe("approved");
  });

  it("approve correction 时字段不在白名单 → 400 且不修改数据", async () => {
    seedSubmission({ field: "createdAt" });
    tables.__tables.herb.set("h_huangqin", { id: "h_huangqin", name: "黄芩", createdAt: new Date() });
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(400);
    expect(tables.__tables.contentSubmission.get("1").status).toBe("pending");
  });

  it("approve flag:置 approved,不修改主数据(信号已消费)", async () => {
    seedSubmission({ type: "flag", field: "functions", suggestedValue: "" });
    tables.__tables.herb.set("h_huangqin", { id: "h_huangqin", name: "黄芩", functions: "清热燥湿" });
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.merged).toBe(false);
    expect(tables.__tables.herb.get("h_huangqin").functions).toBe("清热燥湿"); // 未改动
    expect(tables.__tables.contentSubmission.get("1").status).toBe("approved");
  });

  it("reject:置 rejected 并记录备注", async () => {
    seedSubmission();
    const res = await review(makeReq({ action: "reject", note: "与药典不符,驳回" }), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(200);
    const row = tables.__tables.contentSubmission.get("1");
    expect(row.status).toBe("rejected");
    expect(row.note).toContain("药典");
  });

  it("已处理的反馈不可重复处理 → 400", async () => {
    seedSubmission({ status: "approved" });
    const res = await review(makeReq({ action: "reject" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(400);
  });

  it("目标条目不存在 → 404", async () => {
    seedSubmission({ itemId: "h_notexist" });
    const res = await review(makeReq({ action: "approve" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
  });
});
