// AI 诊疗边界三重防线测试(FR-4.5)
import { describe, it, expect } from "vitest";
import {
  detectViolation,
  appendDisclaimer,
  sanitizeAiReply,
  DISCLAIMER_FOOTNOTE,
  AI_SAFETY_SYSTEM_PROMPT,
} from "@/lib/ai-safety";

describe("防线1 · system prompt 内容", () => {
  it("包含禁止诊疗的硬约束", () => {
    expect(AI_SAFETY_SYSTEM_PROMPT).toContain("禁止");
    expect(AI_SAFETY_SYSTEM_PROMPT).toContain("诊疗");
    expect(AI_SAFETY_SYSTEM_PROMPT).toContain("不构成医疗建议");
  });
});

describe("防线2 · 越界关键词检测", () => {
  it("纯净知识点回答无命中", () => {
    expect(detectViolation("黄芩性味苦寒,归肺胆脾经,功效清热燥湿")).toEqual([]);
  });

  it("命中「可服用」→ 拦截", () => {
    expect(detectViolation("你可以服用黄芩每日三次")).toContain("可以服用");
  });

  it("命中「建议就医」→ 拦截", () => {
    expect(detectViolation("你的症状建议就医处理")).toContain("建议就医");
  });

  it("命中「你的症状」个人健康判断 → 拦截", () => {
    expect(detectViolation("针对你的症状,应当清热")).toContain("你的症状");
  });

  it("命中「针刺治疗」→ 拦截", () => {
    expect(detectViolation("建议针刺治疗合谷穴")).toContain("针刺治疗");
  });
});

describe("防线3 · 免责尾注", () => {
  it("回答被强制追加免责声明", () => {
    const out = appendDisclaimer("麻黄为发汗解表要药");
    expect(out).toContain("不构成医疗建议");
    expect(out).toContain("请咨询执业医师");
  });

  it("已含免责声明时不重复追加", () => {
    const out = appendDisclaimer(`内容${DISCLAIMER_FOOTNOTE}`);
    expect(out.match(/不构成医疗建议/g)?.length).toBe(1);
  });
});

describe("安全出口 sanitizeAiReply", () => {
  it("安全回答 → 通过并带尾注", () => {
    const out = sanitizeAiReply("甘草能调和诸药,是常见使药");
    expect(out).not.toBeNull();
    expect(out).toContain("不构成医疗建议");
  });

  it("越界回答 → 返回 null(调用方降级)", () => {
    expect(sanitizeAiReply("你有炎症,建议服用黄连素")).toBeNull();
    expect(sanitizeAiReply("你的病需要去医院看看")).toBeNull();
  });
});
