/**
 * AI 域安全契约（P0-1 / BR-100）。
 *
 * AI 是"咨询角色"，其输出在返回用户前必须通过安全校验：
 * 不得滑向诊断、处方、用药建议或疗效承诺。
 * 这里只定义契约与一个基于关键词的默认校验器；具体模型调用在 infrastructure 层。
 *
 * P2-11：在 P0-1 的"输出校验"之上补一层**可接线的运行时守卫**，
 * 使 AI 边界不再仅靠"AI 模块无 application 用例"而成立：
 *   - AiOutputGuard        输出侧：组合 MedicalOutputValidator，不安全时给出替换文本
 *   - PromptInjectionDetector 输入侧：浅度启发式检测 prompt injection
 *   - AiMessageGuard       消息管道：组合输入/输出两侧守卫
 *
 * 注意：这是**浅度**运行时兜底，不保证 100% 拦截。生产环境应采用多层防御：
 * 模型层 system prompt 强角色约束 + 输入侧注入检测 + 输出侧医疗违规校验。
 */

import {
  KeywordMedicalSafetyFilter,
  MEDICAL_SAFETY_DISCLAIMER,
  type AiOutputSafetyFilter,
} from "@/shared/domain/medical-safety";

/** 输出校验结果。violations 非空即视为不合法，调用方不得原样返回用户。 */
export interface AiOutputValidation {
  valid: boolean;
  violations: string[];
}

/** AI 输出校验器契约。 */
export interface AiOutputValidator {
  validate(message: string): AiOutputValidation;
}

/**
 * MedicalOutputValidator —— AI 输出的医疗安全校验器。
 *
 * 内部组合 KeywordMedicalSafetyFilter：输出命中违规关键词即判为不合法。
 * 这是一道确定性兜底，模型层仍应在 system prompt 层面约束角色，但不能依赖它。
 */
export class MedicalOutputValidator implements AiOutputValidator {
  private readonly filter: AiOutputSafetyFilter;

  constructor(filter?: AiOutputSafetyFilter) {
    this.filter = filter ?? new KeywordMedicalSafetyFilter();
  }

  validate(message: string): AiOutputValidation {
    const result = this.filter.filter(message);
    if (result.safe) {
      return { valid: true, violations: [] };
    }
    return { valid: false, violations: result.reasons };
  }
}

// ============================================================================
// P2-11：运行时守卫（Runtime Guards）
// ============================================================================

/** 输出守卫结果。unsafe 时必须用 sanitized 替换原文返回用户。 */
export interface AiOutputGuardResult {
  /** true = 安全，可原样放行；false = 命中违规，不得原样返回 */
  safe: boolean;
  /** 命中的违规原因（关键词 / 规则名） */
  violations: string[];
  /** safe=false 时提供的安全替换文本（固定免责声明） */
  sanitized?: string;
}

/**
 * AiOutputGuard —— AI 输出守卫（运行时可接线组件）。
 *
 * 组合 MedicalOutputValidator：当输出不安全时，除返回违规原因外，
 * 还给出一段安全替换文本（免责声明），供调用方直接替换原文返回用户。
 */
export class AiOutputGuard {
  private readonly validator: AiOutputValidator;

  constructor(validator?: AiOutputValidator) {
    this.validator = validator ?? new MedicalOutputValidator();
  }

  guard(message: string): AiOutputGuardResult {
    const result = this.validator.validate(message);
    if (result.valid) {
      return { safe: true, violations: [] };
    }
    return {
      safe: false,
      violations: result.violations,
      // 安全替换文本：不泄露任何疑似越界内容，统一返回免责声明
      sanitized: MEDICAL_SAFETY_DISCLAIMER,
    };
  }
}

/**
 * Prompt Injection 常见注入指令模式（中英双语）。
 *
 * 命中即视为疑似用户试图劫持 AI 角色 / 系统指令。
 * 匹配为不区分大小写的子串匹配（与关键词过滤器风格一致）。
 */
export const PROMPT_INJECTION_PATTERNS: readonly string[] = [
  // 英文
  "ignore previous instructions",
  "ignore all instructions",
  "forget your rules",
  "forget previous",
  "disregard your instructions",
  "system prompt",
  "you are now",
  "act as if",
  "new instructions",
  // 中文
  "忽略以上",
  "忽略之前",
  "忽略你之前的",
  "忘记你的规则",
  "忘记以上",
  "现在你扮演",
  "你现在是",
  "你是一个",
  "你不再是",
  "重新设定你的",
  "系统提示词",
];

/** 输入守卫结果。safe=false 时 patterns 列出全部命中的注入模式。 */
export interface PromptInjectionDetectionResult {
  /** true = 未命中注入模式；false = 疑似 prompt injection */
  safe: boolean;
  /** 命中的模式原文（可能多条） */
  patterns: string[];
}

/**
 * PromptInjectionDetector —— 输入侧 prompt injection 启发式检测。
 *
 * 这是一道**浅度**兜底：只做关键词/短语子串匹配，不做语义理解，
 * 不保证 100% 拦截（变形、编码、多轮拆分注入均可绕过）。
 * 生产环境应结合模型层 system prompt 强约束与输出校验做多层防御。
 */
export class PromptInjectionDetector {
  private readonly patterns: readonly string[];

  constructor(patterns: readonly string[] = PROMPT_INJECTION_PATTERNS) {
    this.patterns = patterns;
  }

  detect(input: string): PromptInjectionDetectionResult {
    if (typeof input !== "string" || input.trim().length === 0) {
      // 空串 / 纯空白：无注入内容，放行
      return { safe: true, patterns: [] };
    }
    const haystack = input.toLowerCase();
    const hits: string[] = [];
    for (const pattern of this.patterns) {
      if (pattern.length > 0 && haystack.includes(pattern.toLowerCase())) {
        hits.push(pattern);
      }
    }
    if (hits.length === 0) {
      return { safe: true, patterns: [] };
    }
    return { safe: false, patterns: hits };
  }
}

/** 单端校验结果（输入或输出共用）。safe=false 时 reasons 非空。 */
export interface GuardCheckResult {
  safe: boolean;
  reasons: string[];
}

/**
 * AiMessageGuard —— AI 消息守卫管道。
 *
 * 组合：
 *   - 输入侧 PromptInjectionDetector（检测用户是否试图劫持指令）
 *   - 输出侧 AiOutputGuard（检测 AI 回复是否越医疗红线）
 *
 * 调用方在把用户消息发给模型前调用 validateInput；
 * 在把模型回复返回用户前调用 validateOutput。
 */
export class AiMessageGuard {
  private readonly injectionDetector: PromptInjectionDetector;
  private readonly outputGuard: AiOutputGuard;

  constructor(deps?: {
    injectionDetector?: PromptInjectionDetector;
    outputGuard?: AiOutputGuard;
  }) {
    this.injectionDetector = deps?.injectionDetector ?? new PromptInjectionDetector();
    this.outputGuard = deps?.outputGuard ?? new AiOutputGuard();
  }

  /** 输入侧：检测用户消息是否含 prompt injection。 */
  validateInput(userMessage: string): GuardCheckResult {
    const result = this.injectionDetector.detect(userMessage);
    if (result.safe) {
      return { safe: true, reasons: [] };
    }
    return {
      safe: false,
      reasons: result.patterns.map(
        (p) => `命中疑似 prompt injection 模式 "${p}"`
      ),
    };
  }

  /** 输出侧：检测 AI 回复是否含医疗违规。 */
  validateOutput(aiMessage: string): GuardCheckResult {
    const result = this.outputGuard.guard(aiMessage);
    if (result.safe) {
      return { safe: true, reasons: [] };
    }
    return { safe: false, reasons: result.violations };
  }
}
