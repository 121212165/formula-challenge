// 错题本 API 测试(重建)
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = {
    answerLog: new Map(),
    herb: new Map(),
    acupoint: new Map(),
    formula: new Map(),
  };
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          if (name === "answerLog") {
            return {
              findMany: vi.fn(async ({ where, orderBy, take }: any) => {
                let rows = [...tables.answerLog.values()].filter((r) => r.userId === where.userId);
                if (where.isCorrect === false) rows = rows.filter((r) => r.isCorrect === false);
                if (where.subject) rows = rows.filter((r) => r.subject === where.subject);
                rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                return rows.slice(0, take ?? 500).map((r) => ({
                  subject: r.subject,
                  formulaId: r.formulaId,
                  createdAt: r.createdAt,
                }));
              }),
            };
          }
          if (tables[name]) {
            return {
              findMany: vi.fn(async ({ where, select }: any) => {
                const rows = [...tables[name].values()].filter((r) =>
                  (where?.id?.in ?? []).includes(r.id)
                );
                return rows.map((r) =>
                  select?.name ? { id: r.id, name: r.name } : r
                );
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

import { GET } from "@/app/api/wrong-answers/route";
import { getServerSession } from "next-auth";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

function seedLog(subject: string, itemId: string, isCorrect: boolean, daysAgo: number, id: number) {
  const createdAt = new Date(Date.now() - daysAgo * 86400000);
  tables.__tables.answerLog.set(String(id), {
    id,
    userId: "user-1",
    subject,
    formulaId: itemId,
    isCorrect,
    createdAt,
  });
}

beforeEach(() => {
  tables.__tables.answerLog.clear();
  tables.__tables.herb.clear();
  tables.__tables.acupoint.clear();
  tables.__tables.formula.clear();
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "user-1", email: "a@b.c" },
  } as any);
});

describe("GET /api/wrong-answers", () => {
  it("未登录返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/wrong-answers"));
    expect(res.status).toBe(401);
  });

  it("只聚合答错记录,同条目计数合并,名称补齐", async () => {
    tables.__tables.herb.set("h_huangqin", { id: "h_huangqin", name: "黄芩" });
    tables.__tables.formula.set("c01", { id: "c01", name: "麻黄汤" });
    seedLog("herb", "h_huangqin", false, 2, 1);
    seedLog("herb", "h_huangqin", false, 1, 2);
    seedLog("herb", "h_huangqin", true, 1, 3); // 答对的不计入
    seedLog("formula", "c01", false, 5, 4);

    const res = await GET(new Request("http://x/api/wrong-answers"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    const hb = data.items.find((i: any) => i.itemId === "h_huangqin");
    expect(hb.wrongCount).toBe(2);
    expect(hb.itemName).toBe("黄芩");
    expect(hb.subject).toBe("herb");
    const fm = data.items.find((i: any) => i.itemId === "c01");
    expect(fm.itemName).toBe("麻黄汤");
  });

  it("subject 过滤只返回该科目", async () => {
    seedLog("herb", "h_huangqin", false, 1, 1);
    seedLog("formula", "c01", false, 1, 2);
    const res = await GET(new Request("http://x/api/wrong-answers?subject=herb"));
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].subject).toBe("herb");
  });

  it("无错题返回空列表", async () => {
    const res = await GET(new Request("http://x/api/wrong-answers"));
    const data = await res.json();
    expect(data.total).toBe(0);
    expect(data.items).toEqual([]);
  });

  it("错次数多的排前面", async () => {
    seedLog("formula", "c01", false, 3, 1);
    seedLog("formula", "c02", false, 1, 2);
    seedLog("formula", "c01", false, 2, 3);
    const res = await GET(new Request("http://x/api/wrong-answers"));
    const data = await res.json();
    expect(data.items[0].itemId).toBe("c01");
    expect(data.items[0].wrongCount).toBe(2);
  });
});
