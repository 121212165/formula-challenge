/**
 * 医疗安全边界扩展单元测试（P0-1 边界用例补充）。
 *
 * medical-safety.test.ts 已覆盖基础拦截/放行；本文件补充：
 *   - 空串、纯英文学习内容等输入边界
 *   - 保守关键词策略的已知行为（学习语境中的"诊断"仍被命中）
 *   - 多关键词同时命中时 reasons 必须完整列出
 *   - 免责声明常量契约
 *   - MedicalOutputValidator 端到端校验
 */
import { describe, it, expect } from "vitest";
import {
  KeywordMedicalSafetyFilter,
  MEDICAL_SAFETY_DISCLAIMER,
  type SafetyFilterResult,
} from "@/shared/domain/medical-safety";
import { MedicalOutputValidator } from "@/modules/ai/domain/safety";

const filter = new KeywordMedicalSafetyFilter();

describe("KeywordMedicalSafetyFilter —— 输入边界", () => {
  it("空字符串视为安全（safe=true，reasons 为空）", () => {
    const result = filter.filter("");
    expect(result.safe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("纯英文学习内容（方剂/组成描述）不命中任何违规词 → safe=true", () => {
    const result = filter.filter("The formula contains four herbs: ginseng, atractylodes, poria and licorice.");
    expect(result.safe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("纯英文学习内容（'The formula contains four herbs'）放行", () => {
    const result = filter.filter("The formula contains four herbs");
    expect(result.safe).toBe(true);
  });

  it("返回结构满足 SafetyFilterResult 契约（safe 为 boolean，reasons 为数组）", () => {
    const safe: SafetyFilterResult = filter.filter("四逆汤回阳救逆");
    expect(typeof safe.safe).toBe("boolean");
    expect(Array.isArray(safe.reasons)).toBe(true);

    const unsafe: SafetyFilterResult = filter.filter("建议诊断后开处方");
    expect(typeof unsafe.safe).toBe("boolean");
    expect(unsafe.reasons.length).toBeGreaterThan(0);
  });
});

describe("KeywordMedicalSafetyFilter —— 保守关键词策略的已知行为", () => {
  // 记录此行为：关键词过滤是**保守兜底**，不做语境理解。
  // 即便"这不是诊断"在学习语境里是声明性表述，只要出现"诊断"子串仍被判定为 safe=false。
  // 这是有意为之的安全侧默认值：宁可误拦，不可漏放。
  it("学习语境中的'这不是诊断'仍命中'诊断'关键词 → safe=false（保守策略，记录此行为）", () => {
    const result = filter.filter("这不是诊断，只是方剂组成的学习笔记");
    expect(result.safe).toBe(false);
    expect(result.reasons.join(" ")).toContain("诊断");
  });

  it("多个违规关键词同时出现时，reasons 必须包含全部命中词（诊断/处方/剂量）", () => {
    const result = filter.filter("这里要诊断、开处方并给出剂量");
    expect(result.safe).toBe(false);
    const joined = result.reasons.join(" | ");
    expect(joined).toContain("诊断");
    expect(joined).toContain("处方");
    expect(joined).toContain("剂量");
  });

  it("关键词匹配不区分大小写（英文 Diagnosis / CURE 同样命中）", () => {
    const upper = filter.filter("This is a Diagnosis that will CURE you.");
    expect(upper.safe).toBe(false);
    expect(upper.reasons.join(" ")).toContain("diagnosis");
  });
});

describe("MEDICAL_SAFETY_DISCLAIMER —— 免责声明常量契约", () => {
  it("常量非空且为字符串", () => {
    expect(typeof MEDICAL_SAFETY_DISCLAIMER).toBe("string");
    expect(MEDICAL_SAFETY_DISCLAIMER.length).toBeGreaterThan(0);
  });

  it("包含'不构成医疗建议'这一核心免责语义", () => {
    expect(MEDICAL_SAFETY_DISCLAIMER).toContain("不构成医疗建议");
  });

  it("以'学习参考'定位开头，明确非诊疗工具", () => {
    expect(MEDICAL_SAFETY_DISCLAIMER).toContain("学习参考");
  });
});

describe("MedicalOutputValidator —— AI 输出端到端校验", () => {
  const validator = new MedicalOutputValidator();

  it("违规消息 valid=false 且 violations 非空", () => {
    const bad = validator.validate("你这个症状可以诊断为气虚，开出处方按剂量服用即可治愈。");
    expect(bad.valid).toBe(false);
    expect(bad.violations.length).toBeGreaterThan(0);
  });

  it("正常学习消息 valid=true 且 violations 为空", () => {
    const good = validator.validate("四君子汤益气健脾，由人参、白术、茯苓、甘草组成。");
    expect(good.valid).toBe(true);
    expect(good.violations).toEqual([]);
  });

  it("空消息视为合法（无可拦截内容）", () => {
    const empty = validator.validate("");
    expect(empty.valid).toBe(true);
    expect(empty.violations).toEqual([]);
  });
});
