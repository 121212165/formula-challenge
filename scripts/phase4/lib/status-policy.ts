/**
 * Phase 4 管线 · 状态策略（KP 级 + item 级 双层判定）
 *
 * KP 级（decideKpStatus）：
 *   - item 级有阻断错误（名称空 / 来源未登记 / 重复）→ 本 item 全部 KP 强制 review；
 *   - 本 KP 自身命中任何 error → review；
 *   - 否则 → published（warning 不阻断）。
 *
 * item 级（在 pipeline.ts 内由 KP 状态聚合）：
 *   - 命中 DUPLICATE（规则 ⑦）→ "skip"，直接丢弃，不进任何层；
 *   - 该 item 下所有 KP 都 published → "published"；
 *   - 任一 KP 为 review → "review"。
 *
 * 映射到 Prisma 枚举：
 *   - published → KnowledgePoint.status = published / ContentItem.status = published
 *   - review    → KnowledgePoint.status = draft（人工补录后再发）
 *   - skip      → 不落库
 */
import type { PipelineDecision, QualityIssue } from "./types";

/** KP 级状态。 */
export type KpPipelineStatus = "published" | "review";

/**
 * KP 级判定：本 KP 自身检查全过，且 item 级无阻断错误 → published；否则 review。
 * @param kpIssues 本 KP 自己的 issues（规则 ②④⑤⑥⑧）
 * @param itemOk   item 级是否无阻断错误（名称/来源/重复都过）
 */
export function decideKpStatus(
  kpIssues: QualityIssue[],
  itemOk: boolean,
): KpPipelineStatus {
  if (!itemOk) return "review";
  if (kpIssues.some((i) => i.severity === "error")) return "review";
  return "published";
}

export interface StatusPolicyInput {
  /** 合并后的 item 级 + kp 级 issues。 */
  issues: QualityIssue[];
  /** 来源是否已登记（等同规则 ③ 结果，便于单测）。 */
  hasSource: boolean;
}

/**
 * 通用 issue 级判定（保留供单测与复用）：
 * 命中 DUPLICATE → skip；有 error 或来源缺失 → review；否则 published。
 * 注意：item 级最终 decision 由 pipeline.ts 按「全部 KP 都 published」聚合得出，
 * 本函数不替代该聚合。
 */
export function decideStatus(input: StatusPolicyInput): PipelineDecision {
  const { issues, hasSource } = input;

  // 重复 → 直接 skip
  if (issues.some((i) => i.ruleId === "DUPLICATE")) {
    return "skip";
  }

  // 任何 error 或来源缺失 → review
  const hasError = issues.some((i) => i.severity === "error");
  if (hasError || !hasSource) {
    return "review";
  }

  return "published";
}
