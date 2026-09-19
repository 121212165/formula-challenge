/**
 * Phase 4 管线 · 共享编排骨架
 *
 * 各科目导入器（formula / herb / acupoint）只需提供自己的 normalize 函数，
 * 调用 runPipeline 即可完成：
 *   raw → normalized → 八项检查 → 状态策略 → validated → published → report
 *
 * 文件约定（相对项目根）：
 *   data/normalized/<subject>.json
 *   data/validated/<subject>.json
 *   data/published/<subject>.json
 *   data/reports/<subject>-report.json
 *
 * 本文件层不直连数据库；published/*.json 即后续 db:seed 的输入。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  NormalizedContentItem,
  PipelineRunArgs,
  PipelineRunResult,
  QualityIssue,
  QualityReport,
  ValidatedContentItem,
} from "./types";
import { cuid, kpCodeOf } from "./ids";
import { mapSourceRef } from "./sources";
import { checkContentItem, checkKnowledgePoint } from "./quality-check";
import { decideKpStatus } from "./status-policy";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function writeJsonSync(absPath: string, data: unknown): void {
  mkdirSync(path.dirname(absPath), { recursive: true });
  // 同步写，避免编排函数变成 async；管线规模在千级，无性能问题。
  writeFileSync(absPath, JSON.stringify(data, null, 2), "utf-8");
}

/** 把一条 normalized item 质检成 validated item（KP 级 + item 级双层状态）。 */
function validateItem(
  item: NormalizedContentItem,
  seenItemKeys: Set<string>,
): { validated: ValidatedContentItem; allIssues: QualityIssue[] } {
  const seed = mapSourceRef(item.sourceRef);
  const sourceId = seed.id;

  const ctx = { seenItemKeys, sourceId, sourceFields: item.sourceFields };
  const itemIssues = checkContentItem(item, sourceId, ctx);

  // item 级是否无阻断错误（名称/来源/重复）。有则本 item 全部 KP 强制 review。
  const itemHasBlockingError = itemIssues.some((i) => i.severity === "error");
  const isDuplicate = itemIssues.some((i) => i.ruleId === "DUPLICATE");

  const knowledgePoints = item.knowledgePoints.map((kp, idx) => {
    const kpIssues = checkKnowledgePoint(kp, ctx);
    return {
      ...kp,
      id: cuid(),
      code: kpCodeOf(kp.type),
      issues: kpIssues,
      status: decideKpStatus(kpIssues, !itemHasBlockingError),
      sortOrder: kp.sortOrder || idx + 1,
    };
  });

  const allIssues: QualityIssue[] = [
    ...itemIssues,
    ...knowledgePoints.flatMap((kp) => kp.issues),
  ];

  // item 级 decision：重复 → skip；所有 KP 都 published → published；否则 review。
  let decision: ValidatedContentItem["decision"];
  if (isDuplicate) {
    decision = "skip";
  } else if (knowledgePoints.every((kp) => kp.status === "published")) {
    decision = "published";
  } else {
    decision = "review";
  }

  const { knowledgePoints: _kp, ...rest } = item;
  const validated: ValidatedContentItem = {
    id: cuid(),
    ...rest,
    sourceId,
    knowledgePoints,
    issues: allIssues,
    decision,
  };
  return { validated, allIssues };
}

/**
 * 运行一个科目的完整管线。
 * @throws 当 rawRecords 为空时抛错（空导入不应静默成功）。
 */
export function runPipeline(args: PipelineRunArgs): PipelineRunResult {
  const { subject, rawRecords, sourceFiles, normalize } = args;
  if (!rawRecords || rawRecords.length === 0) {
    throw new Error(`runPipeline[${subject}]: rawRecords 为空，拒绝跑空管线`);
  }

  const seenItemKeys = new Set<string>();
  const normalized: NormalizedContentItem[] = [];
  const validated: ValidatedContentItem[] = [];
  const published: ValidatedContentItem[] = [];
  const issuesByRule: Record<string, number> = {};
  const samples: QualityReport["samples"] = [];

  rawRecords.forEach((raw, idx) => {
    const norm = normalize(raw, idx + 1);
    normalized.push(norm);

    const { validated: item, allIssues } = validateItem(norm, seenItemKeys);
    validated.push(item);

    for (const issue of allIssues) {
      issuesByRule[issue.ruleId] = (issuesByRule[issue.ruleId] ?? 0) + 1;
    }
    if (allIssues.length > 0 && samples.length < 50) {
      samples.push({
        slug: item.slug,
        name: item.name,
        decision: item.decision,
        issues: allIssues,
      });
    }

    if (item.decision === "published") {
      published.push(item);
    }
  });

  // KP 级统计：只统计非 skip 的 item（重复 item 整组丢弃，不计入 KP 池）。
  const liveItems = validated.filter((v) => v.decision !== "skip");
  const kpsTotal = liveItems.reduce((n, v) => n + v.knowledgePoints.length, 0);
  const kpsPublished = liveItems.reduce(
    (n, v) => n + v.knowledgePoints.filter((kp) => kp.status === "published").length,
    0,
  );

  const counts = {
    itemsNormalized: normalized.length,
    itemsPublished: published.length,
    itemsReview: validated.filter((v) => v.decision === "review").length,
    itemsSkipped: validated.filter((v) => v.decision === "skip").length,
    kpsTotal,
    kpsPublished,
    kpsReview: kpsTotal - kpsPublished,
  };

  const note =
    "item 级 published 表示整组所有 KP 都干净；若 item 级 published 偏低但 kpsPublished 很高，" +
    "说明只是个别 KP（如 herb.usage / acupoint.special）缺源字段待补录，其余 KP 仍可学，" +
    "可学 KP 数请看 kpsPublished。";

  const report: QualityReport = {
    subject,
    generatedAt: new Date().toISOString(),
    sourceFiles,
    counts,
    issuesByRule,
    note,
    samples,
  };

  const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");
  const normalizedFile = path.join(ROOT, "data", "normalized", `${subject}.json`);
  const validatedFile = path.join(ROOT, "data", "validated", `${subject}.json`);
  const publishedFile = path.join(ROOT, "data", "published", `${subject}.json`);
  const reportFile = path.join(ROOT, "data", "reports", `${subject}-report.json`);

  writeJsonSync(normalizedFile, { subject, generatedAt: report.generatedAt, sourceFiles, count: normalized.length, items: normalized });
  writeJsonSync(validatedFile, { subject, generatedAt: report.generatedAt, sourceFiles, count: validated.length, items: validated });
  writeJsonSync(publishedFile, { subject, generatedAt: report.generatedAt, sourceFiles, count: published.length, items: published });
  writeJsonSync(reportFile, report);

  return {
    normalizedFile: rel(normalizedFile),
    validatedFile: rel(validatedFile),
    publishedFile: rel(publishedFile),
    reportFile: rel(reportFile),
    counts,
  };
}
