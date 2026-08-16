// 中药 API 测试(Phase 1)
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = {
    herb: new Map(),
    herbCategory: new Map(),
  };
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          return {
            findMany: vi.fn(async ({ include, take, orderBy, where } = {}) => {
              const rows = [...tables[name].values()];
              let out = rows;
              if (where?.categoryId) out = out.filter((r) => r.categoryId === where.categoryId);
              if (where?.level) out = out.filter((r) => r.level === where.level);
              if (where?.OR) {
                const kw = where.OR[0]?.name?.contains;
                if (kw) out = out.filter((r) => r.name.includes(kw));
              }
              return (out.slice(0, take ?? 500) as any[]).map((r) => ({
                ...r,
                category: include?.category ? { name: "清热药" } : undefined,
              }));
            }),
            findUnique: vi.fn(async ({ where }) => tables[name].get(where.id)),
          };
        },
      }
    ),
    __tables: tables,
  };
});

import { GET as listHerbs } from "@/app/api/herbs/route";
import { GET as getHerb } from "@/app/api/herbs/[id]/route";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

beforeEach(() => {
  tables.__tables.herb.clear();
  tables.__tables.herbCategory.clear();
  // 造数据
  tables.__tables.herb.set("h_mahuang", {
    id: "h_mahuang",
    name: "麻黄",
    categoryId: 1,
    level: "一类",
    property: "辛温",
    meridian: "肺膀胱",
    functions: "发汗解表",
    indications: "风寒感冒",
    source: "",
  });
  tables.__tables.herb.set("h_fuling", {
    id: "h_fuling",
    name: "茯苓",
    categoryId: 6,
    level: "一类",
    property: "甘淡",
    meridian: "心肺脾肾",
    functions: "利水渗湿",
    indications: "水肿",
    source: "",
  });
  tables.__tables.herbCategory.set(String(1), { id: 1, name: "解表药" });
});

describe("GET /api/herbs 列表", () => {
  it("返回全部中药(带分类名)", async () => {
    const res = await listHerbs(new Request("http://x/api/herbs"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.herbs.length).toBe(2);
    expect(data.herbs[0].categoryName).toBe("清热药");
  });

  it("支持 categoryId 过滤", async () => {
    const res = await listHerbs(new Request("http://x/api/herbs?categoryId=6"));
    const data = await res.json();
    expect(data.herbs.length).toBe(1);
    expect(data.herbs[0].name).toBe("茯苓");
  });

  it("支持 search 过滤", async () => {
    const res = await listHerbs(new Request("http://x/api/herbs?search=麻黄"));
    const data = await res.json();
    expect(data.herbs.length).toBe(1);
    expect(data.herbs[0].name).toBe("麻黄");
  });
});

describe("GET /api/herbs/[id] 详情", () => {
  it("返回中药详情", async () => {
    const res = await getHerb(new Request("http://x"), {
      params: Promise.resolve({ id: "h_mahuang" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.name).toBe("麻黄");
    expect(data.functions).toBe("发汗解表");
  });

  it("非 herb 前缀 id 一律 404(防越科查询)", async () => {
    const res = await getHerb(new Request("http://x"), {
      params: Promise.resolve({ id: "c01_麻黄汤" }),
    });
    expect(res.status).toBe(404);
  });

  it("不存在的 herb id 返回 404", async () => {
    const res = await getHerb(new Request("http://x"), {
      params: Promise.resolve({ id: "h_notexist" }),
    });
    expect(res.status).toBe(404);
  });
});
