/**
 * Phase 4 五层管线 · 纯 JSON 数据结构定义
 *
 * 这些结构与 prisma/schema.prisma 对齐（ContentItem / KnowledgePoint /
 * ContentSource / ContentVersion），但本管线只在文件层流转 JSON，
 * 不直连 Postgres、不写库。后续导入子代理生成的产物就是这套结构。
 *
 * 层级：
 *   raw/        ← extract_excel.py 产物（RawRecord）
 *   normalized/ ← 各科目导入器产出（NormalizedContentItem）
 *   validated/  ← 八项检查 + 状态策略后（ValidatedContentItem）
 *   published/  ← decision === "published" 的子集
 *   reports/    ← QualityReport
 */
import type {
  KnowledgePointType,
  SubjectCode,
} from "@/shared/types/knowledge-point-type";

export type { SubjectCode };

/** 质检严重级别：error 阻断发布，warning 仅提示。 */
export type Severity = "error" | "warning";

/** 管线对一个 ContentItem 的最终裁定。 */
export type PipelineDecision = "published" | "review" | "skip";

/** ContentItem.status（与 Prisma ContentItemStatus 对齐）。 */
export type ContentItemStatus = "draft" | "review" | "published" | "archived";

/** KnowledgePoint.status（与 Prisma KnowledgePointStatus 对齐，无 review）。 */
export type KpStatus = "draft" | "published" | "archived";

/** extract_excel.py 落盘的单条源记录。 */
export interface RawRecord {
  /** 源 sheet 名，如 "V1_方剂完整" */
  sourceSheet: string;
  /** 源 Excel 行号（1-based，含表头偏移） */
  sourceRow: number;
  /** 中文字段名 → 源值；空单元格已规范化为 null */
  fields: Record<string, unknown>;
}

/** ContentSource 种子（登记在 sources.ts，全管线复用）。 */
export interface ContentSourceSeed {
  /** cuid 格式，写死、跨 run 稳定 */
  id: string;
  title: string;
  edition: string | null;
  publisher: string | null;
  year: number | null;
  citation: string;
}

/** 溯源信息：定位到原始 Excel 的文件 / sheet / 行号。 */
export interface RawProvenance {
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
}

/** 尚未质检的知识点草稿（一个知识点 = 一道可考的 canonicalAnswer）。 */
export interface KnowledgePointDraft {
  /** 统一类型编码，如 "formula.ingredients" */
  type: KnowledgePointType;
  /** 题面标题，如 "麻黄汤·组成" */
  title: string;
  /** 标准答案文本（KP 本体） */
  canonicalAnswer: string;
  explanation: string | null;
  sortOrder: number;
}

/** normalized 层产物：一个 ContentItem + 其全部 KP 草稿。 */
export interface NormalizedContentItem {
  subject: SubjectCode;
  /** 形如 formula-0001；规则见 ids.ts#slugify */
  slug: string;
  /** 中文名（原样保留，不做拼音） */
  name: string;
  /** 源表原 ID（h_mahuang / a_lieque），方剂无则为 null */
  externalId: string | null;
  /** 章节名 / 中药分类 / 经络，用于归类 */
  category: string | null;
  /** 等级：一类方 / 一类 / 二类 等 */
  level: string | null;
  /** 源表"数据来源"列原值（formulas_enriched.json / seed-herbs-db.ts / null） */
  sourceRef: string | null;
  provenance: RawProvenance;
  /**
   * 质检快照：本 ContentItem 的源字段值（中文字段名 → 规范化文本）。
   * 八项检查的规则 ⑥（完整性）按 KP 类型从中取必需字段判定。
   */
  sourceFields: Record<string, string | null>;
  knowledgePoints: KnowledgePointDraft[];
}

/** 一条质检问题。 */
export interface QualityIssue {
  /** 规则编号，见 quality-check.ts 的 RULE_* 常量 */
  ruleId: string;
  severity: Severity;
  message: string;
  /** 命中的字段名（可选） */
  field?: string;
}

/** 质检后的知识点：补 id / code，挂 issues，并自带 KP 级状态。 */
export interface ValidatedKnowledgePoint extends KnowledgePointDraft {
  /** 同 contentItemId 下唯一：取 type 最后一段，如 ingredients */
  code: string;
  /** cuid */
  id: string;
  issues: QualityIssue[];
  /**
   * KP 级状态：本 KP 自身检查全过且 item 级无阻断错误 → published；
   * 本 KP 自身命中任何 error → review。落库时 published→KnowledgePoint.status=published，
   * review→KnowledgePoint.status=draft（待人工补录后再发）。
   */
  status: "published" | "review";
}

/** validated / published 层产物。 */
export interface ValidatedContentItem {
  id: string;
  subject: SubjectCode;
  slug: string;
  name: string;
  externalId: string | null;
  category: string | null;
  level: string | null;
  sourceRef: string | null;
  /** 命中的 ContentSource 种子 id（已登记） */
  sourceId: string;
  provenance: RawProvenance;
  sourceFields: Record<string, string | null>;
  knowledgePoints: ValidatedKnowledgePoint[];
  /** item 级 issues（名称 / slug 等） */
  issues: QualityIssue[];
  /** 状态策略裁定结果 */
  decision: PipelineDecision;
}

/** 质量报告（reports/<subject>-report.json）。 */
export interface QualityReport {
  subject: SubjectCode;
  generatedAt: string;
  sourceFiles: string[];
  /**
   * 双维度计数：
   *   items* —— ContentItem 级（整组是否所有 KP 都干净）；
   *   kps*   —— KnowledgePoint 级（逐个 KP 自身是否可学）。
   * 注意：item 级 published=0 不代表没有可学的 KP，要看 kpsPublished。
   */
  counts: {
    itemsNormalized: number;
    itemsPublished: number;
    itemsReview: number;
    itemsSkipped: number;
    kpsTotal: number;
    kpsPublished: number;
    kpsReview: number;
  };
  issuesByRule: Record<string, number>;
  /** 给人工的一句话口径说明（如 item 级为 0 但 kpsPublished 很高的解释）。 */
  note: string;
  /** 每个有问题的条目的摘要（最多保留前 50 条） */
  samples: Array<{
    slug: string;
    name: string;
    decision: PipelineDecision;
    issues: QualityIssue[];
  }>;
}

/** 各科目导入器调用 pipeline.runPipeline 时的入参。 */
export interface PipelineRunArgs {
  subject: SubjectCode;
  /** 原始记录（来自 data/raw/*.json 的 records 数组） */
  rawRecords: RawRecord[];
  /** raw 文件相对路径，写入溯源与报告 */
  sourceFiles: string[];
  /** 科目专属：把一条 RawRecord 转成 NormalizedContentItem */
  normalize: (raw: RawRecord, seq: number) => NormalizedContentItem;
}

/** runPipeline 的返回摘要。 */
export interface PipelineRunResult {
  normalizedFile: string;
  validatedFile: string;
  publishedFile: string;
  reportFile: string;
  counts: QualityReport["counts"];
}
