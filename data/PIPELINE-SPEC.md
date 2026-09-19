# Phase 4 数据五层管线规范（PIPELINE-SPEC）

> 版本：v1.1（状态判定改为 KP 级；formula.mnemonic 三列任一即通过）｜ 适用：formula / herb / acupoint 三个科目导入子代理
> 本规范是强制契约。所有导入产物必须严格按本文件的命名、结构、字段、检查与状态规则生成；
> 共享代码已在 `scripts/phase4/lib/` 落地，禁止自行重造轮子、禁止改本文件写死的规则。

---

## 0. 总览

```
Excel 总览.xlsx
   │  scripts/phase4/extract_excel.py（Python，openpyxl）
   ▼
data/raw/*.json            ← 原始落盘（已完成，勿重跑除非源表变更）
   │  各科目导入器实现 normalize(raw, seq)
   ▼
data/normalized/<subject>.json
   │  runPipeline() 内置：八项检查 + 状态策略 + ID/slug 生成
   ├──────────────▶ data/validated/<subject>.json
   ├──────────────▶ data/published/<subject>.json   （decision=published 子集，db:seed 输入）
   └──────────────▶ data/reports/<subject>-report.json
```

- 文件层交付，**不直连 Postgres**，**不改 `prisma/schema.prisma`**。
- 技术栈：Next.js + Prisma v6 + TS ESM（`type: module`），脚本用 `tsx` 运行。
- Windows PowerShell：禁 `&&` / heredoc；JSON 参数写文件再引用。

---

## 1. 五层目录与文件命名

| 层 | 目录 | 文件命名 | 内容 |
|---|---|---|---|
| raw | `data/raw/` | `<kind>.json`（已落盘 5 个） | extract_excel.py 产物，勿手改 |
| normalized | `data/normalized/` | `<subject>.json` | `subject ∈ {formula, herb, acupoint}` |
| validated | `data/validated/` | `<subject>.json` | 每条挂 id / issues / decision |
| published | `data/published/` | `<subject>.json` | decision === `published` 的子集 |
| reports | `data/reports/` | `<subject>-report.json` | 质量报告（见 §7 模板） |

raw 层已有文件（记录数，源表行数）：

| 文件 | 源 sheet | 行数 |
|---|---|---|
| `formula_full.json` | V1_方剂完整 | 190 |
| `formula_pending.json` | V1_方剂待补全 | 70 |
| `formula_textbook_ref.json` | V1_方剂教材原文 | 212（**仅交叉去重参照，不入主导入**） |
| `herbs.json` | V1_中药 | 306 |
| `acupoints.json` | V1_腧穴 | 259 |

### 1.1 raw 记录结构（extract_excel.py 落盘，禁止改动）

```jsonc
{
  "kind": "herbs",
  "sourceFile": "formula-challenge-V1V2数据总览.xlsx",
  "sourceSheet": "V1_中药",
  "generatedAt": "ISO8601",
  "count": 306,
  "records": [
    {
      "sourceSheet": "V1_中药",
      "sourceRow": 2,            // 1-based，含表头偏移
      "fields": {                // 中文字段名 → 源值；空单元格已规范化为 null
        "ID": "h_mahuang", "名称": "麻黄", "分类": "解表药",
        "性味": "辛、微苦,温", "归经": "肺、膀胱",
        "功效": "...", "主治": "...", "等级": "一类",
        "助记": "...", "助记解释": "...", "数据来源": "seed-herbs-db.ts"
      }
    }
  ]
}
```

各表列（0-based，中文键名固定）：
- 方剂完整：`名称 章 章节名 等级 组成 功效 主治 助记 助记解释 传统方歌 传统方歌解释 触发词 数据来源`
- 方剂待补全：`名称 章 章节名 等级 组成 功效 主治 方歌`（**无 数据来源 / 助记解释列**）
- 教材原文：`名称 组成 功效 主治 方歌`（仅参照）
- 中药：`ID 名称 分类 性味 归经 功效 主治 等级 助记 助记解释 数据来源`
- 腧穴：`ID 名称 拼音 编码 经络 定位 主治 刺法 特殊 注意事项 助记 助记解释 等级 排序`

---

## 2. ContentSource 登记规则（写死在 `sources.ts`）

三个来源种子，id 写死、跨 run 稳定：

| 种子 | id | citation |
|---|---|---|
| 《方剂学》教材 | `cb46d25840001c9afdfb44fbb` | 全国中医药行业高等教育教材《方剂学》 |
| 岐黄数据库 | `cb46d25840002f02127598548` | 岐黄数据库 qihuang.cc 在线检索 |
| 内部整理数据 | `cb46d25840003c4c43b6a1dd5` | V1→V2 人工整理补全数据，未经外部出版物核验 |

**来源归属口径**（`mapSourceRef(ref)` 实现，禁止改表）：
- 源表"数据来源"列 = `formulas_enriched.json` / `seed-herbs-db.ts` → **岐黄数据库**；
- 该列为空 / null / 未识别文件名（待补全表、腧穴表、教材原文表均无此列）→ **内部整理数据**；
- 教材直接引用（如传统方歌、教材原文对照）→ **《方剂学》教材**（由导入器在 normalize 时按内容显式选择）。

> 审计备注：formulas_enriched.json / seed-herbs-db.ts 在 V1 即由岐黄知识库富化而来，故归岐黄。
> 该映射如与人工核验结论冲突，由 review 阶段改 `sources.ts` 的 `FILE_NAME_TO_SOURCE_ID`，**不要**在导入器里硬编码。

---

## 3. ID 与 slug 规则（`ids.ts`，写死）

- **ContentItem.id / KnowledgePoint.id**：`cuid()` 生成，格式 `c` + 24 位小写十六进制（时间戳 8 + 计数器 4 + 随机 12）。纯 TS 实现，不依赖 npm。
- **slug**：`slugify(subject, seq)` = `<subject>-<4 位行序>`，如 `formula-0001`、`herb-0042`、`acupoint-0007`。
  - **不做拼音**；**不沿用源表 `h_` / `a_` / `c_` 前缀**；中文名只进 `name` 字段。
  - `seq` = 该 raw 文件内从 1 开始的行序。
- **KnowledgePoint.code**：`kpCodeOf(type)` = type 最后一段，如 `formula.ingredients` → `ingredients`。同一 ContentItem 下唯一。
- 源表原 ID（`h_mahuang` / `a_lieque`）存 `externalId`，仅作溯源，不进 slug。

---

## 4. normalized 层 JSON Schema（导入器产出，TS 接口见 `types.ts`）

```ts
NormalizedContentItem {
  subject: "formula" | "herb" | "acupoint";
  slug: string;            // slugify 产物
  name: string;            // 中文原名
  externalId: string | null;
  category: string | null; // 章节名 / 中药分类 / 经络
  level: string | null;
  sourceRef: string | null; // 源表"数据来源"列原值，原样回传
  provenance: { sourceFile; sourceSheet; sourceRow };
  sourceFields: Record<string, string | null>;
  knowledgePoints: KnowledgePointDraft[];
}

KnowledgePointDraft {
  type: KnowledgePointType;   // 见 §5 枚举
  title: string;              // 题面，如 "麻黄汤·组成"
  canonicalAnswer: string;    // KP 本体：标准答案文本
  explanation: string | null;
  sortOrder: number;
}
```

外层信封：
```jsonc
{ "subject": "formula", "generatedAt": "...", "sourceFiles": ["data/raw/formula_full.json"],
  "count": 190, "items": [ NormalizedContentItem, ... ] }
```

---

## 5. KP 类型枚举与必需源字段（`REQUIRED_SOURCE_FIELDS`，写死）

| type | 必需源字段（中文键） |
|---|---|
| formula.ingredients | 组成 |
| formula.functions | 功效 |
| formula.indications | 主治 |
| formula.mnemonic | 助记 / 传统方歌 / 方歌（**任一非空即通过**，全空才报 ⑥） |
| herb.property | 性味 |
| herb.meridian | 归经 |
| herb.functions | 功效 |
| herb.indications | 主治 |
| **herb.usage** | **用法用量**（Excel 无源列 → 必然 ⑥ → review） |
| **herb.contraindications** | **使用注意**（中药表无此列 → 必然 ⑥ → review） |
| acupoint.location | 定位 |
| acupoint.indications | 主治 |
| acupoint.method | 刺法 |
| acupoint.special | 特殊 |
| acupoint.mnemonic | 助记 |

> 设计意图：herb.usage / herb.contraindications 仍要建 KP 草稿（占位待补录），
> 但因无源数据，一律判 review，**绝不允许发布**。不要因为无源就跳过建 KP。

---

## 6. 八项检查与 review / publish 判定

检查纯函数：`checkContentItem(item, sourceId, ctx)` 与 `checkKnowledgePoint(kp, ctx)`（`quality-check.ts`）。

| # | ruleId | 级别 | 触发条件 |
|---|---|---|---|
| ① | NAME_NONEMPTY | error | ContentItem.name 空白 |
| ② | ANSWER_NONEMPTY | error | canonicalAnswer 空白或 trim 后 < 2 字 |
| ③ | SOURCE_REGISTERED | error | sourceId 不在三个种子内 |
| ④ | ANSWER_NO_PLACEHOLDER | error | 答案含 `TODO/XXX/N/A/NaN/待补/待定/占位/undefined/null` |
| ⑤ | TYPE_KNOWN | error | type 不在 §5 枚举 |
| ⑥ | FIELD_INCOMPLETE | error | §5 必需源字段组「任一非空」即通过；全空才报 |
| ⑦ | DUPLICATE | error | 同 `subject|name` 第二次出现 |
| ⑧ | FORMAT_CLEAN | warning | 连续 3+ 空白 / UTF-8 误读乱码 / 尾截断标记 |

**判定是 KP 级，不是整条 item 一刀切**：

- **KP 级**（`decideKpStatus(kpIssues, itemOk)`）：
  - item 级有阻断错误（名称空 / 来源未登记 / 重复）→ 该 item 全部 KP 强制 `review`；
  - 本 KP 自身命中任何 **error** → `review`；
  - 本 KP 自身检查全过且无阻断 → `published`（warning 不阻断）。
- **item 级 decision**（pipeline 内由 KP 状态聚合）：
  - 命中 ⑦ DUPLICATE → **`skip`**（丢弃，不进任何层）；
  - 该 item 下**所有 KP 都 published** → **`published`**；
  - 任一 KP 为 review → **`review`**。
- `published/<subject>.json` 仍只放 item decision = `published` 的整组。
- **可学 KP 看 `kpsPublished`，不要只看 item 级 published**：
  例如 herb 因 usage/contraindications 恒缺源列，306 味 item 级全 review、published=0，
  但每味药的 property/meridian/functions/indications 四个 KP 是干净的、按 KP 级 published。

**映射 Prisma 枚举**（后续 db:seed 时）：
- `published` → KnowledgePoint.status = `published`，ContentItem.status = `published`；
- `review` → KnowledgePoint.status = `draft`（人工补录后再发）；
- `skip` → 不落库。

---

## 7. 质量报告模板（`data/reports/<subject>-report.json`）

```jsonc
{
  "subject": "formula",
  "generatedAt": "ISO8601",
  "sourceFiles": ["data/raw/formula_full.json"],
  "counts": {
    "itemsNormalized": 0, "itemsPublished": 0, "itemsReview": 0, "itemsSkipped": 0,
    "kpsTotal": 0, "kpsPublished": 0, "kpsReview": 0
  },
  "issuesByRule": { "FIELD_INCOMPLETE": 0, "DUPLICATE": 0, "...": 0 },
  "note": "item 级 published 低不代表无可学 KP，请看 kpsPublished",
  "samples": [
    { "slug": "formula-0001", "name": "麻黄汤", "decision": "published",
      "issues": [ { "ruleId": "...", "severity": "error|warning", "message": "...", "field": "..." } ] }
  ]
}
```

- `items*` = ContentItem 级（整组是否所有 KP 都干净）；`kps*` = KnowledgePoint 级（逐个 KP 自身是否可学）。
- `issuesByRule` 仍逐 KP 计数；`samples` 最多保留前 50 条有问题的条目（provenance 在 item 内）。

---

## 8. 导入器调用契约（三个子代理必须照做）

1. 从 `data/raw/<...>.json` 读 `records`；
2. 实现 `normalize(raw: RawRecord, seq: number): NormalizedContentItem`，产出该科目的全部 KP 草稿；
3. 调用共享骨架：

```ts
import { runPipeline } from "../../../scripts/phase4/lib";

const result = runPipeline({
  subject: "herb",                       // 本科目
  rawRecords: parsed.records,           // raw 文件 records 数组
  sourceFiles: ["data/raw/herbs.json"],
  normalize,                            // 你实现的函数
});
// result.counts / result.*File 即三层产物与报告路径
```

4. 不要自己写 ID/slug、不要自己跑八项检查、不要自己写报告——全部交给 `runPipeline`；
5. `sourceFields` 必须把该 item 用到的中文字段值原样放入（`null` 表示源表为空），否则 ⑥ 会误报；
6. 完成后核对 `<subject>-report.json` 的 `counts` 与 `issuesByRule`，review 数量应与本规范预期一致（herb 科目 review 必然偏高，因 usage/contraindications 无源列）。
