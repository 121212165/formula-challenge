// 多科目评分引擎测试(FR-2.5 功效默写 / FR-3.5 定位默写)
import { describe, it, expect } from "vitest";
import {
  functionClauseScore,
  locationKeywordScore,
  normalizeWithSynonyms,
  splitClauses,
  extractLocationKeywords,
  scoreByQuestionType,
} from "@/lib/subject-scoring";

describe("功效默写评分 · 同义归一化", () => {
  it("标准词与同义变体归一化后相等", () => {
    expect(normalizeWithSynonyms("清热燥湿")).toBe(normalizeWithSynonyms("清热除湿"));
    expect(normalizeWithSynonyms("泻火解毒")).toBe(normalizeWithSynonyms("降火解毒"));
    expect(normalizeWithSynonyms("活血化瘀")).toBe(normalizeWithSynonyms("活血祛瘀"));
  });

  it("功效句切分正确", () => {
    expect(splitClauses("清热燥湿,泻火解毒;止血")).toEqual([
      "清热燥湿",
      "泻火解毒",
      "止血",
    ]);
  });
});

describe("功效默写评分 · 阈值验证", () => {
  const reference = "清热燥湿,泻火解毒,止血安胎";

  it("完全一致 → 1 分", () => {
    expect(functionClauseScore(reference, reference)).toBeCloseTo(1, 1);
  });

  it("同义改写(燥湿→除湿,泻火→降火)→ ≥0.7 通过", () => {
    const score = functionClauseScore("清热除湿,降火解毒,止血安胎", reference);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("漏写一半功效 → <0.6 不通过", () => {
    const score = functionClauseScore("清热燥湿", reference);
    expect(score).toBeLessThan(0.6);
  });

  it("空回答 → 0 分", () => {
    expect(functionClauseScore("", reference)).toBe(0);
  });

  it("多答无关内容被 precision 惩罚", () => {
    const score = functionClauseScore(
      "清热燥湿,泻火解毒,止血安胎,我爱吃西瓜",
      reference
    );
    expect(score).toBeLessThan(1);
  });
});

describe("定位默写评分 · 关键词命中", () => {
  const reference = "手背,第2掌骨桡侧的中点处";

  it("完整定位 → ≥0.8", () => {
    const score = locationKeywordScore("手背,第2掌骨桡侧的中点处", reference);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it("漏关键标志(掌骨)→ <0.6 不通过", () => {
    const score = locationKeywordScore("手背上", reference);
    expect(score).toBeLessThan(0.6);
  });

  it("关键标志齐全但语序不同 → ≥0.7", () => {
    const score = locationKeywordScore("第2掌骨桡侧,手背中点", reference);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("特征词抽取命中正确", () => {
    const hits = extractLocationKeywords("第2掌骨桡侧的中点处");
    expect(hits).toContain("掌骨");
    expect(hits).toContain("桡侧");
  });

  it("极短定位无特征词时退回文本相似度", () => {
    expect(locationKeywordScore("人中", "人中")).toBeCloseTo(1, 1);
  });
});

describe("多科目分发入口", () => {
  it("herb+functions 走功效评分", () => {
    const s1 = scoreByQuestionType("herb", "functions", "清热燥湿,泻火解毒", "清热燥湿,泻火解毒");
    expect(s1).toBeCloseTo(1, 1);
  });

  it("acupoint+location 走定位评分", () => {
    const s1 = scoreByQuestionType("acupoint", "location", "第2掌骨桡侧中点", "手背,第2掌骨桡侧的中点处");
    expect(s1).toBeGreaterThanOrEqual(0.7);
  });

  it("未知题型退回 textSimilarity", () => {
    expect(scoreByQuestionType("herb", "mnemonic", "abc", "abc")).toBeCloseTo(1, 1);
  });
});
