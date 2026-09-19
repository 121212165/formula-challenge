/**
 * 医疗安全边界（架构文档安全红线 / P0-1）。
 *
 * 本系统是中医知识**学习**辅助工具，不是诊疗系统。AI 与任何对外输出都必须遵守同一安全策略：
 *   - 不得给出诊断（diagnosis）
 *   - 不得开处方（prescription）
 *   - 不得推荐具体药物剂量（dosage）
 *   - 不得替代医生给出医疗建议（medical advice）
 *   - 不得承诺疗效 / 治愈（cure / effect promise）
 *
 * 本模块只声明边界与提供一道"输出前过滤"。它不保证 100% 拦截，
 * 但任何 AI 输出在返回用户前都必须经过 AiOutputSafetyFilter / AiOutputValidator。
 */

/** 医疗安全策略：以结构化字段显式列出被禁止的行为。 */
export interface MedicalSafetyPolicy {
  /** 禁止给出诊断 */
  forbidDiagnosis: boolean;
  /** 禁止开处方 */
  forbidPrescription: boolean;
  /** 禁止推荐具体药物剂量 */
  forbidDosage: boolean;
  /** 禁止替代医生给出医疗建议 */
  forbidMedicalAdvice: boolean;
  /** 禁止承诺疗效 / 治愈 */
  forbidCurePromise: boolean;
  /** 人类可读的策略说明 */
  description: string;
}

/** 默认医疗安全策略（全部禁止）。 */
export const MEDICAL_SAFETY_POLICY: MedicalSafetyPolicy = {
  forbidDiagnosis: true,
  forbidPrescription: true,
  forbidDosage: true,
  forbidMedicalAdvice: true,
  forbidCurePromise: true,
  description:
    "学习辅助工具不得给出诊断、开处方、推荐具体剂量、替代医生做医疗建议或承诺疗效。",
};

/** 输出过滤结果。sanitized 仅在过滤实现做了改写时提供。 */
export interface SafetyFilterResult {
  /** true = 安全，可放行；false = 命中违规，不得原样返回用户 */
  safe: boolean;
  /** 命中的违规原因（关键词 / 规则名） */
  reasons: string[];
  /** 可选：被清洗后的安全文本（本类默认不提供改写） */
  sanitized?: string;
}

/** AI 输出安全过滤器契约。 */
export interface AiOutputSafetyFilter {
  filter(content: string): SafetyFilterResult;
}

/** 面向用户的固定免责声明（任何 AI 回复应附带）。 */
export const MEDICAL_SAFETY_DISCLAIMER =
  "本内容仅供学习参考，不构成医疗建议。如有健康问题请咨询专业医师。";

/**
 * 违规关键词清单（中英双语）。
 * 命中即视为疑似越界医疗行为；匹配为不区分大小写的子串匹配。
 */
export const MEDICAL_VIOLATION_KEYWORDS: readonly string[] = [
  // 中文
  "诊断",
  "处方",
  "剂量",
  "服用",
  "推荐用药",
  "治疗方案",
  "治愈",
  "疗效",
  // 英文
  "diagnosis",
  "prescription",
  "dosage",
  "take",
  "cure",
  "treat",
];

/**
 * 基于关键词的医疗安全过滤器（KeywordMedicalSafetyFilter）。
 *
 * 这是一道**浅度**但确定性的兜底：对 AI 输出做违规关键词扫描。
 * 检测到任意违规词时 safe=false，并在 reasons 中列出全部命中的关键词。
 */
export class KeywordMedicalSafetyFilter implements AiOutputSafetyFilter {
  private readonly keywords: readonly string[];

  constructor(keywords: readonly string[] = MEDICAL_VIOLATION_KEYWORDS) {
    this.keywords = keywords;
  }

  filter(content: string): SafetyFilterResult {
    if (typeof content !== "string" || content.length === 0) {
      return { safe: true, reasons: [] };
    }
    const haystack = content.toLowerCase();
    const hits: string[] = [];
    for (const keyword of this.keywords) {
      if (keyword.length > 0 && haystack.includes(keyword.toLowerCase())) {
        hits.push(keyword);
      }
    }
    if (hits.length === 0) {
      return { safe: true, reasons: [] };
    }
    return {
      safe: false,
      reasons: hits.map(
        (k) => `命中医疗违规关键词 "${k}"（疑似诊断/处方/用药建议/疗效承诺）`
      ),
    };
  }
}
