/**
 * Phase 4 管线基础设施 · 单元测试
 *
 * 覆盖：
 *   - ids.ts：cuid 格式与唯一性、slugify 规则、kpCodeOf
 *   - sources.ts：三类来源映射（教材/岐黄/内部兜底）、登记校验
 *   - quality-check.ts：八项检查每条规则的正反例
 *   - status-policy.ts：published / review / skip 判定
 *   - pipeline.ts：空 raw 拒绝跑空
 */
import { describe, it, expect } from "vitest";
import {
  CUID_PATTERN,
  cuid,
  isCuid,
  slugify,
  kpCodeOf,
} from "../../../scripts/phase4/lib/ids";
import {
  ALL_SOURCES,
  SOURCE_INTERNAL,
  SOURCE_QIHUANG,
  SOURCE_TEXTBOOK,
  isRegisteredSourceId,
  mapSourceRef,
} from "../../../scripts/phase4/lib/sources";
import {
  REQUIRED_SOURCE_FIELDS,
  RULE,
  checkContentItem,
  checkKnowledgePoint,
} from "../../../scripts/phase4/lib/quality-check";
import { decideStatus } from "../../../scripts/phase4/lib/status-policy";
import { runPipeline } from "../../../scripts/phase4/lib/pipeline";
import type {
  KnowledgePointDraft,
  NormalizedContentItem,
  SubjectCode,
} from "../../../scripts/phase4/lib/types";

// ---------- 测试工厂 ----------

function makeItem(partial: Partial<NormalizedContentItem> = {}): NormalizedContentItem {
  return {
    subject: "formula",
    slug: "formula-0001",
    name: "麻黄汤",
    externalId: null,
    category: "解表剂",
    level: "一类方",
    sourceRef: "formulas_enriched.json",
    provenance: { sourceFile: "herbs.json", sourceSheet: "V1_中药", sourceRow: 2 },
    sourceFields: {},
    knowledgePoints: [],
    ...partial,
  };
}

function makeKp(partial: Partial<KnowledgePointDraft> = {}): KnowledgePointDraft {
  return {
    type: "formula.ingredients",
    title: "麻黄汤·组成",
    canonicalAnswer: "麻黄 桂枝 杏仁 甘草",
    explanation: null,
    sortOrder: 1,
    ...partial,
  };
}

// ---------- ids ----------

describe("ids.cuid", () => {
  it("格式为 c + 24 位小写十六进制", () => {
    expect(isCuid(cuid())).toBe(true);
    expect(CUID_PATTERN.test(cuid())).toBe(true);
  });

  it("批量生成近似唯一（1 万次无碰撞）", () => {
    const set = new Set<string>();
    for (let i = 0; i < 10000; i++) set.add(cuid());
    expect(set.size).toBe(10000);
  });
});

describe("ids.slugify", () => {
  it("按 subject 短码 + 4 位行序生成", () => {
    expect(slugify("formula", 1)).toBe("formula-0001");
    expect(slugify("herb", 42)).toBe("herb-0042");
    expect(slugify("acupoint", 7)).toBe("acupoint-0007");
  });

  it("非法行序抛错", () => {
    expect(() => slugify("formula", 0)).toThrow();
    expect(() => slugify("formula", -1)).toThrow();
  });
});

describe("ids.kpCodeOf", () => {
  it("取 type 最后一段", () => {
    expect(kpCodeOf("formula.ingredients")).toBe("ingredients");
    expect(kpCodeOf("herb.contraindications")).toBe("contraindications");
    expect(kpCodeOf("acupoint.mnemonic")).toBe("mnemonic");
  });
});

// ---------- sources ----------

describe("sources 种子", () => {
  it("三个种子 id 均为合法 cuid 且唯一", () => {
    for (const s of ALL_SOURCES) expect(isCuid(s.id)).toBe(true);
    expect(new Set(ALL_SOURCES.map((s) => s.id)).size).toBe(3);
  });

  it("citation 文案符合登记口径", () => {
    expect(SOURCE_TEXTBOOK.citation).toContain("方剂学");
    expect(SOURCE_QIHUANG.citation).toContain("qihuang.cc");
    expect(SOURCE_INTERNAL.citation).toContain("未经外部出版物核验");
  });
});

describe("sources.mapSourceRef", () => {
  it("formulas_enriched.json → 岐黄数据库", () => {
    expect(mapSourceRef("formulas_enriched.json").id).toBe(SOURCE_QIHUANG.id);
  });
  it("seed-herbs-db.ts → 岐黄数据库", () => {
    expect(mapSourceRef("seed-herbs-db.ts").id).toBe(SOURCE_QIHUANG.id);
  });
  it("空 / null → 内部整理数据", () => {
    expect(mapSourceRef(null).id).toBe(SOURCE_INTERNAL.id);
    expect(mapSourceRef("").id).toBe(SOURCE_INTERNAL.id);
    expect(mapSourceRef("   ").id).toBe(SOURCE_INTERNAL.id);
  });
  it("未识别文件名兜底内部整理数据", () => {
    expect(mapSourceRef("some-random-file.txt").id).toBe(SOURCE_INTERNAL.id);
  });
});

describe("sources.isRegisteredSourceId", () => {
  it("登记过的 id 返回 true", () => {
    expect(isRegisteredSourceId(SOURCE_TEXTBOOK.id)).toBe(true);
  });
  it("空 / 未登记 id 返回 false", () => {
    expect(isRegisteredSourceId(null)).toBe(false);
    expect(isRegisteredSourceId("c000000000000000000000000")).toBe(false);
  });
});

// ---------- 八项检查 ----------

describe("规则① NAME_NONEMPTY", () => {
  it("名称为空 → error", () => {
    const issues = checkContentItem(makeItem({ name: "  " }), SOURCE_QIHUANG.id, {
      seenItemKeys: new Set(),
    });
    expect(issues.some((i) => i.ruleId === RULE.NAME_NONEMPTY && i.severity === "error")).toBe(true);
  });
  it("名称正常 → 不命中", () => {
    const issues = checkContentItem(makeItem(), SOURCE_QIHUANG.id, { seenItemKeys: new Set() });
    expect(issues.some((i) => i.ruleId === RULE.NAME_NONEMPTY)).toBe(false);
  });
});

describe("规则② ANSWER_NONEMPTY", () => {
  it("canonicalAnswer 为空 → error", () => {
    const issues = checkKnowledgePoint(makeKp({ canonicalAnswer: "" }), { sourceFields: {} });
    expect(issues.some((i) => i.ruleId === RULE.ANSWER_NONEMPTY)).toBe(true);
  });
  it("长度不足 2 → error", () => {
    const issues = checkKnowledgePoint(makeKp({ canonicalAnswer: "麻" }), { sourceFields: {} });
    expect(issues.some((i) => i.ruleId === RULE.ANSWER_NONEMPTY)).toBe(true);
  });
  it("长度 ≥ 2 → 不命中", () => {
    const issues = checkKnowledgePoint(makeKp(), { sourceFields: {} });
    expect(issues.some((i) => i.ruleId === RULE.ANSWER_NONEMPTY)).toBe(false);
  });
});

describe("规则③ SOURCE_REGISTERED", () => {
  it("未登记 sourceId → error", () => {
    const issues = checkContentItem(makeItem(), "c000000000000000000000000", {
      seenItemKeys: new Set(),
    });
    expect(issues.some((i) => i.ruleId === RULE.SOURCE_REGISTERED)).toBe(true);
  });
  it("登记过的种子 → 不命中", () => {
    const issues = checkContentItem(makeItem(), SOURCE_TEXTBOOK.id, { seenItemKeys: new Set() });
    expect(issues.some((i) => i.ruleId === RULE.SOURCE_REGISTERED)).toBe(false);
  });
});

describe("规则④ ANSWER_NO_PLACEHOLDER", () => {
  it("含 TODO / NaN / 待补 → error", () => {
    expect(checkKnowledgePoint(makeKp({ canonicalAnswer: "TODO 待补" }), { sourceFields: {} })
      .some((i) => i.ruleId === RULE.ANSWER_NO_PLACEHOLDER)).toBe(true);
    expect(checkKnowledgePoint(makeKp({ canonicalAnswer: "结果是 NaN" }), { sourceFields: {} })
      .some((i) => i.ruleId === RULE.ANSWER_NO_PLACEHOLDER)).toBe(true);
  });
  it("正常答案 → 不命中", () => {
    expect(checkKnowledgePoint(makeKp(), { sourceFields: {} })
      .some((i) => i.ruleId === RULE.ANSWER_NO_PLACEHOLDER)).toBe(false);
  });
});

describe("规则⑤ TYPE_KNOWN", () => {
  it("未知类型 → error", () => {
    const issues = checkKnowledgePoint(
      makeKp({ type: "formula.bogus" as never }),
      { sourceFields: {} },
    );
    expect(issues.some((i) => i.ruleId === RULE.TYPE_KNOWN)).toBe(true);
  });
  it("合法类型 → 不命中", () => {
    expect(checkKnowledgePoint(makeKp(), { sourceFields: {} })
      .some((i) => i.ruleId === RULE.TYPE_KNOWN)).toBe(false);
  });
});

describe("规则⑥ FIELD_INCOMPLETE", () => {
  it("formula.ingredients 缺「组成」→ error", () => {
    const issues = checkKnowledgePoint(makeKp(), { sourceFields: { 组成: null } });
    expect(issues.some((i) => i.ruleId === RULE.FIELD_INCOMPLETE && i.field === "组成")).toBe(true);
  });
  it("formula.ingredients 有「组成」→ 不命中", () => {
    expect(checkKnowledgePoint(makeKp(), { sourceFields: { 组成: "麻黄 桂枝" } })
      .some((i) => i.ruleId === RULE.FIELD_INCOMPLETE)).toBe(false);
  });
  it("herb.usage 源表无对应列 → 必然 error（转 review）", () => {
    const issues = checkKnowledgePoint(
      makeKp({ type: "herb.usage", canonicalAnswer: "煎服，3-9g" }),
      { sourceFields: {} },
    );
    expect(issues.some((i) => i.ruleId === RULE.FIELD_INCOMPLETE)).toBe(true);
    // 且规则⑥映射表里确实登记了这两个无源字段
    expect(REQUIRED_SOURCE_FIELDS["herb.usage"]).toContain("用法用量");
    expect(REQUIRED_SOURCE_FIELDS["herb.contraindications"]).toContain("使用注意");
  });
});

describe("规则⑦ DUPLICATE", () => {
  it("同 subject 同 name 第二次出现 → error", () => {
    const seen = new Set<string>();
    checkContentItem(makeItem(), SOURCE_QIHUANG.id, { seenItemKeys: seen });
    const second = checkContentItem(makeItem({ slug: "formula-0002" }), SOURCE_QIHUANG.id, {
      seenItemKeys: seen,
    });
    expect(second.some((i) => i.ruleId === RULE.DUPLICATE)).toBe(true);
  });
  it("不同 name → 不命中", () => {
    const seen = new Set<string>();
    checkContentItem(makeItem(), SOURCE_QIHUANG.id, { seenItemKeys: seen });
    const other = checkContentItem(makeItem({ name: "桂枝汤" }), SOURCE_QIHUANG.id, {
      seenItemKeys: seen,
    });
    expect(other.some((i) => i.ruleId === RULE.DUPLICATE)).toBe(false);
  });
});

describe("规则⑧ FORMAT_CLEAN", () => {
  it("连续空白 → warning", () => {
    const issues = checkKnowledgePoint(makeKp({ canonicalAnswer: "麻黄   桂枝" }), { sourceFields: {} });
    expect(issues.some((i) => i.ruleId === RULE.FORMAT_CLEAN && i.severity === "warning")).toBe(true);
  });
  it("乱码串 → warning", () => {
    const issues = checkKnowledgePoint(makeKp({ canonicalAnswer: "åŠŸèƒ½ä¸»æ²»" }), { sourceFields: {} });
    expect(issues.some((i) => i.ruleId === RULE.FORMAT_CLEAN)).toBe(true);
  });
  it("干净文本 → 不命中", () => {
    expect(checkKnowledgePoint(makeKp(), { sourceFields: {} })
      .some((i) => i.ruleId === RULE.FORMAT_CLEAN)).toBe(false);
  });
});

// ---------- 状态策略 ----------

describe("decideStatus", () => {
  const err = { ruleId: "X", severity: "error" as const, message: "e" };
  const warn = { ruleId: "Y", severity: "warning" as const, message: "w" };

  it("无 error 且有来源 → published", () => {
    expect(decideStatus({ issues: [warn], hasSource: true })).toBe("published");
  });
  it("有 error → review", () => {
    expect(decideStatus({ issues: [err], hasSource: true })).toBe("review");
  });
  it("来源缺失 → review", () => {
    expect(decideStatus({ issues: [], hasSource: false })).toBe("review");
  });
  it("命中 DUPLICATE → skip", () => {
    expect(decideStatus({ issues: [{ ...err, ruleId: RULE.DUPLICATE }], hasSource: true })).toBe("skip");
  });
});

// ---------- pipeline 守卫 ----------

describe("runPipeline", () => {
  it("rawRecords 为空时拒绝跑空", () => {
    expect(() =>
      runPipeline({
        subject: "formula" as SubjectCode,
        rawRecords: [],
        sourceFiles: [],
        normalize: () => makeItem(),
      }),
    ).toThrow(/空管线/);
  });
});
