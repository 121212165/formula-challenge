// 多科目(subject)扩展 · 单元测试
// 覆盖:id 前缀规范、数据条目校验(中药/腧穴)
import { describe, it, expect } from "vitest";
import {
  SUBJECTS,
  validItemId,
  validateHerbEntry,
  validateAcupointEntry,
  type HerbEntry,
  type AcupointEntry,
} from "@/lib/subject";

describe("subject 扩展 · id 前缀规范", () => {
  it("SUBJECTS 枚举包含三科", () => {
    expect(SUBJECTS).toEqual(["formula", "herb", "acupoint"]);
  });

  it("formula 条目 id 以 c_ 开头(现有方剂数据兼容)", () => {
    expect(validItemId("formula", "c01_麻黄汤")).toBe(true);
    expect(validItemId("formula", "c02_桂枝汤")).toBe(true);
  });

  it("herb 条目 id 以 h_ 开头", () => {
    expect(validItemId("herb", "h_huangqi")).toBe(true);
    expect(validItemId("herb", "h_001")).toBe(true);
    expect(validItemId("herb", "c01_麻黄汤")).toBe(false);
  });

  it("acupoint 条目 id 以 a_ 开头", () => {
    expect(validItemId("acupoint", "a_li4")).toBe(true);
    expect(validItemId("acupoint", "c01_麻黄汤")).toBe(false);
    expect(validItemId("acupoint", "h_huangqi")).toBe(false);
  });

  it("非法科目直接拒绝", () => {
    expect(validItemId("xxx" as never, "c01_麻黄汤")).toBe(false);
  });
});

describe("subject 扩展 · 中药条目校验", () => {
  it("完整条目通过", () => {
    const herb: HerbEntry = {
      id: "h_huangqin",
      name: "黄芩",
      category: "清热药",
      property: "苦寒",
      meridian: "肺、胆、脾、大肠、小肠",
      functions: "清热燥湿，泻火解毒，止血，安胎",
      indications: "湿温暑湿，湿热泻痢，肺热咳嗽，血热吐衄",
      level: "一类",
    };
    const result = validateHerbEntry(herb);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("缺功效/归经判为不完整(完整率红线)", () => {
    const herb: HerbEntry = {
      id: "h_bad",
      name: "缺字段药",
      category: "清热药",
      property: "",
      meridian: "",
      functions: "",
      indications: "",
      level: "二类",
    };
    const result = validateHerbEntry(herb);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("functions");
    expect(result.missing).toContain("meridian");
  });

  it("id 前缀错误直接拒绝", () => {
    const herb: HerbEntry = {
      id: "c01_麻黄汤",
      name: "错误id",
      category: "清热药",
      property: "苦寒",
      meridian: "肺",
      functions: "清热",
      indications: "泻火",
      level: "一类",
    };
    expect(validateHerbEntry(herb).valid).toBe(false);
  });
});

describe("subject 扩展 · 腧穴条目校验", () => {
  it("完整腧穴通过", () => {
    const point: AcupointEntry = {
      id: "a_li4",
      name: "合谷",
      code: "LI4",
      meridian: "手阳明大肠经",
      location: "手背，第2掌骨桡侧的中点处",
      indications: "头痛，齿痛，目赤肿痛，发热恶寒",
      method: "直刺0.5-1寸",
      level: "一类",
    };
    const result = validateAcupointEntry(point);
    expect(result.valid).toBe(true);
  });

  it("缺定位/主治判为不完整", () => {
    const point: AcupointEntry = {
      id: "a_bad",
      name: "缺字段穴",
      code: "XX1",
      meridian: "手阳明大肠经",
      location: "",
      indications: "",
      method: "",
      level: "二类",
    };
    const result = validateAcupointEntry(point);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("location");
    expect(result.missing).toContain("indications");
  });

  it("国际代码缺失判为不完整(SEO/排序依赖 code)", () => {
    const point: AcupointEntry = {
      id: "a_no_code",
      name: "无代码穴",
      code: "",
      meridian: "任脉",
      location: "前正中线上",
      indications: "xxx",
      method: "平刺",
      level: "二类",
    };
    expect(validateAcupointEntry(point).valid).toBe(false);
  });
});
