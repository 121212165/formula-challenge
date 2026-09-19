/**
 * 医疗安全边界单元测试（P0-1）。
 * 验证 KeywordMedicalSafetyFilter 的越界拦截能力与正常学习内容放行。
 */
import { describe, it, expect } from "vitest";
import {
  KeywordMedicalSafetyFilter,
  MEDICAL_SAFETY_DISCLAIMER,
  MEDICAL_SAFETY_POLICY,
  MEDICAL_VIOLATION_KEYWORDS,
} from "@/shared/domain/medical-safety";
import { MedicalOutputValidator } from "@/modules/ai/domain/safety";

const filter = new KeywordMedicalSafetyFilter();

describe("KeywordMedicalSafetyFilter", () => {
  it("对包含诊断/处方/用药/疗效等违规内容返回 safe=false 且 reasons 非空", () => {
    const dangerous =
      "你这种情况可以诊断为脾胃虚寒，建议开出处方，剂量为每日一剂，连续服用一周即可治愈。";
    const result = filter.filter(dangerous);
    expect(result.safe).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    // 至少命中中文违规词
    expect(result.reasons.join("\n")).toContain("诊断");
  });

  it("对英文违规词（diagnosis/prescription/dosage/cure）也能识别", () => {
    const result = filter
      .filter("This is a diagnosis and prescription, dosage take daily and cure you.");
    expect(result.safe).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("对正常学习内容（方剂组成/功用）返回 safe=true", () => {
    const normal =
      "四逆汤由附子、干姜、炙甘草组成，功用为回阳救逆，适用于少阴病四肢厥逆。";
    const result = filter.filter(normal);
    expect(result.safe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("空字符串视为安全", () => {
    expect(filter.filter("").safe).toBe(true);
  });

  it("策略常量与免责声明存在且内容正确", () => {
    expect(MEDICAL_SAFETY_DISCLAIMER).toBe(
      "本内容仅供学习参考，不构成医疗建议。如有健康问题请咨询专业医师。"
    );
    // 五项禁止全部开启
    expect(MEDICAL_SAFETY_POLICY.forbidDiagnosis).toBe(true);
    expect(MEDICAL_SAFETY_POLICY.forbidPrescription).toBe(true);
    expect(MEDICAL_SAFETY_POLICY.forbidDosage).toBe(true);
    expect(MEDICAL_SAFETY_POLICY.forbidMedicalAdvice).toBe(true);
    expect(MEDICAL_SAFETY_POLICY.forbidCurePromise).toBe(true);
    // 关键词清单覆盖要求的全部词
    for (const kw of [
      "诊断", "处方", "剂量", "服用", "推荐用药", "治疗方案", "治愈", "疗效",
      "diagnosis", "prescription", "dosage", "take", "cure", "treat",
    ]) {
      expect(MEDICAL_VIOLATION_KEYWORDS).toContain(kw);
    }
  });
});

describe("MedicalOutputValidator", () => {
  it("违规输出 valid=false 并给出 violations；正常输出 valid=true", () => {
    const validator = new MedicalOutputValidator();

    const bad = validator.validate("建议诊断后开出处方，剂量遵医嘱，可治愈。");
    expect(bad.valid).toBe(false);
    expect(bad.violations.length).toBeGreaterThan(0);

    const good = validator.validate("四君子汤益气健脾，组成：人参、白术、茯苓、甘草。");
    expect(good.valid).toBe(true);
    expect(good.violations).toEqual([]);
  });
});
