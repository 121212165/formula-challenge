// 腧穴 API 测试(Phase 2)
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const tables: Record<string, Map<string, any>> = {
    acupoint: new Map(),
    meridian: new Map(),
  };
  return {
    db: new Proxy(
      {},
      {
        get(_t, name: string) {
          return {
            findMany: vi.fn(async ({ include, take, where } = {}) => {
              const rows = [...tables[name].values()];
              let out = rows;
              if (where?.meridianId) out = out.filter((r) => r.meridianId === where.meridianId);
              if (where?.level) out = out.filter((r) => r.level === where.level);
              if (where?.OR) {
                const kw = where.OR[0]?.name?.contains;
                if (kw) out = out.filter((r) => r.name.includes(kw) || r.indications.includes(kw));
              }
              return (out.slice(0, take ?? 500) as any[]).map((r) => ({
                ...r,
                meridian: include?.meridian ? { name: r._meridianName } : undefined,
              }));
            }),
            findUnique: vi.fn(async ({ where, include }) => {
              const r = tables[name].get(where.id);
              if (!r) return null;
              return { ...r, meridian: include?.meridian ? { name: r._meridianName } : undefined };
            }),
          };
        },
      }
    ),
    __tables: tables,
  };
});

import { GET as listAcupoints } from "@/app/api/acupoints/route";
import { GET as getAcupoint } from "@/app/api/acupoints/[id]/route";

const tables = (await import("@/lib/db")) as unknown as { __tables: Record<string, Map<string, any>> };

beforeEach(() => {
  tables.__tables.acupoint.clear();
  tables.__tables.meridian.clear();
  tables.__tables.acupoint.set("a_hegu", {
    id: "a_hegu",
    name: "合谷",
    pinyin: "hegu",
    code: "LI4",
    meridianId: 2,
    _meridianName: "手阳明大肠经",
    location: "手背,第1、2掌骨间,第2掌骨桡侧的中点处",
    indications: "头痛,目赤肿痛,齿痛,口眼歪斜,发热恶寒",
    method: "直刺0.5-1寸;孕妇不宜针刺",
    special: "原穴",
    caution: "孕妇禁针",
    mnemonic: "面口合谷收",
    mnemonicExplanation: "合谷为四总穴之一,善治头面部诸疾",
    level: "一类",
    sortOrder: 1,
  });
  tables.__tables.acupoint.set("a_zusanli", {
    id: "a_zusanli",
    name: "足三里",
    pinyin: "zusanli",
    code: "ST36",
    meridianId: 4,
    _meridianName: "足阳明胃经",
    location: "小腿前外侧,犊鼻下3寸,胫骨前嵴外一横指",
    indications: "胃痛,呕吐,腹胀,泄泻,虚劳羸瘦",
    method: "直刺1-2寸;强壮保健要穴",
    special: "合穴",
    caution: "",
    mnemonic: "肚腹三里留",
    mnemonicExplanation: "足三里为保健要穴,善治胃肠病",
    level: "一类",
    sortOrder: 2,
  });
  tables.__tables.meridian.set("2", { id: 2, name: "手阳明大肠经", code: "LI" });
  tables.__tables.meridian.set("4", { id: 4, name: "足阳明胃经", code: "ST" });
});

describe("GET /api/acupoints 列表", () => {
  it("返回全部腧穴(带经络名)", async () => {
    const res = await listAcupoints(new Request("http://x/api/acupoints"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.acupoints.length).toBe(2);
    expect(data.acupoints[0].meridianName).toBe("手阳明大肠经");
  });

  it("按 meridianId 过滤", async () => {
    const res = await listAcupoints(new Request("http://x/api/acupoints?meridianId=2"));
    const data = await res.json();
    expect(data.acupoints.length).toBe(1);
    expect(data.acupoints[0].id).toBe("a_hegu");
  });

  it("search 按名称/主治命中", async () => {
    const res = await listAcupoints(new Request("http://x/api/acupoints?search=胃痛"));
    const data = await res.json();
    expect(data.acupoints.length).toBe(1);
    expect(data.acupoints[0].id).toBe("a_zusanli");
  });
});

describe("GET /api/acupoints/[id] 详情", () => {
  it("返回完整字段(含特定穴/禁忌/口诀)", async () => {
    const res = await getAcupoint(new Request("http://x/api/acupoints/a_hegu"), {
      params: Promise.resolve({ id: "a_hegu" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.name).toBe("合谷");
    expect(data.special).toBe("原穴");
    expect(data.caution).toContain("孕妇");
    expect(data.mnemonic).toBe("面口合谷收");
    expect(data.meridianName).toBe("手阳明大肠经");
  });

  it("非 a_ 前缀 id 返回 404(防越科查询)", async () => {
    const res = await getAcupoint(new Request("http://x/api/acupoints/f_abc"), {
      params: Promise.resolve({ id: "f_abc" }),
    });
    expect(res.status).toBe(404);
  });

  it("不存在的 id 返回 404", async () => {
    const res = await getAcupoint(new Request("http://x/api/acupoints/a_notexist"), {
      params: Promise.resolve({ id: "a_notexist" }),
    });
    expect(res.status).toBe(404);
  });
});
