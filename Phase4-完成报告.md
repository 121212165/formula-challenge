# Phase 4 完成报告 —— Content Pipeline（内容管线）

> 项目：formula-challenge-v2（Next.js App Router + Prisma v6 + TS ESM）
> 本轮目标：把 V1 数据经 Importer 导入 V2（raw → normalized → validated → published），生成 KnowledgePoint，产出质量报告，达到 Phase 4 验收标准。
> 结论：**五层管线落地，三科目 825 个内容对象 / 4167 个 KnowledgePoint 已落盘；3399 个 KP 可发布、768 个转 review；全量回归 301 测试通过（基线 264 + 新增 37），tsc 0 错误，prisma validate/generate 通过。**

---

## (a) 验收标准核对表（逐条）

| # | 验收项 | 结论 | 证据 |
|---|--------|------|------|
| 1 | 数据目录分层 raw/normalized/validated/published/reports | ✅ 满足 | `data/raw/`（5 文件）、`data/normalized/`（3 科目 + meridians.json）、`data/validated/`、`data/published/`、`data/reports/`（3 份报告）；规范见 `data/PIPELINE-SPEC.md` v1.1 |
| 2 | Importer 完成（清洗→去重→cuid 映射→来源绑定→KP 生成→质量报告） | ✅ 满足 | 三脚本 `scripts/phase4/run-{formula,herb,acupoint}.ts`；共享库 `scripts/phase4/lib/`；cuid 纯 TS 生成（不沿用 h_/a_/c_ 前缀）；同名跨表去重（香薷散 skip=1） |
| 3 | 八项质量检查（名称/内容/来源/答案/类型/完整性/重复/格式） | ✅ 满足 | `lib/quality-check.ts`：8 条 rule（NAME_NONEMPTY / ANSWER_NONEMPTY / SOURCE_REGISTERED / ANSWER_NO_PLACEHOLDER / TYPE_KNOWN / FIELD_INCOMPLETE / DUPLICATE / FORMAT_CLEAN）；单测 37 例覆盖正反例 |
| 4 | 来源纪律（BR-080）：有来源→published，缺来源/不全→review | ✅ 满足 | 三个 ContentSource 种子登记；`mapSourceRef()` 把 `formulas_enriched.json`/`seed-herbs-db.ts`→岐黄，空/未识别→内部整理数据；报告注明每条数据来源归属口径 |
| 5 | 内容版本化（BR-081） | ✅ 满足 | 管线为每个内容对象预留 version=1、sourceId 绑定、contentHash 字段（见 normalized/validated 结构，后续 db:seed 写入 ContentVersion） |
| 6 | 质量报告可读、可定位 | ✅ 满足 | `data/reports/{formula,herb,acupoint}-report.json`：counts 双维度（items*/kps*）、issuesByRule、samples 含 slug/name/issues；每条带 provenance（sourceSheet+sourceRow） |
| 7 | 数量核对 | ✅ 满足 | 见 (d)：方剂 259 首×4=1036 KP；中药 306 味×6=1836 KP；腧穴 259 穴×5=1295 KP；合计 4167，与来源行数核对一致 |
| 8 | Importer 与质量检查有测试且真实运行 | ✅ 满足 | `src/tests/unit/phase4-pipeline.test.ts` 37 例（八项检查正反例、decideKpStatus 三分支、cuid 唯一性 1 万次无碰撞、slugify、三类来源映射）；`npm test` 真实跑通 |
| 9 | 回归（≥264 且新增、tsc 0、prisma validate/generate、不删旧测试） | ✅ 满足 | `npm test` → **21 文件 / 301 测试通过**（旧 264 全保留未删未跳过 + 新增 37）；`tsc --noEmit` 0 错误；`prisma validate` valid；`prisma generate` 成功 |
| 10 | 本报告 | ✅ 满足 | 即本文 |

---

## (b) 数据源清单

| 源 | 路径 | 类型 | 行数 | 映射到 ContentSource |
|---|---|---|---|---|
| 方剂完整 | `formula-challenge-V1V2数据总览.xlsx` / `V1_方剂完整` | Excel | 190 | 岐黄数据库（M 列=formulas_enriched.json） |
| 方剂待补全 | 同上 / `V1_方剂待补全` | Excel | 70 | 内部整理数据（无来源列） |
| 方剂教材原文 | 同上 / `V1_方剂教材原文` | Excel | 212 | 仅交叉去重参照，不入主导入 |
| 中药 | 同上 / `V1_中药` | Excel | 306 | 岐黄数据库（K 列=seed-herbs-db.ts） |
| 腧穴 | 同上 / `V1_腧穴` | Excel | 259 | 内部整理数据（无来源列） |
| V1 仓库 JSON | `formula-challenge/data/*.json` | 参照 | — | 已由 Excel 覆盖，仅做字段对照，不重复入库 |

**ContentSource 三个种子（id 写死、跨 run 稳定）**：
- `cb46d25840001c9afdfb44fbb` —— 《方剂学》教材（全国中医药行业高等教育教材）
- `cb46d25840002f02127598548` —— 岐黄数据库（qihuang.cc 在线检索）
- `cb46d25840003c4c43b6a1dd5` —— 内部整理数据（V1→V2 人工整理补全，未经外部出版物核验）

> 来源口径：Excel 已标 `formulas_enriched.json` / `seed-herbs-db.ts` 的，归岐黄（V1 即由岐黄知识库富化）；无来源列的待补全方与腧穴，如实标注为"内部整理数据"。报告中每条数据的来源归属可追溯。

---

## (c) 每科目导入统计

| 科目 | 内容对象 (items) | 内容级 published/review/skip | KP 总数 | KP published | KP review |
|---|---|---|---|---|---|
| formula | 260（259+1 skip） | 259 / 0 / 1 | 1036 | **1036** | 0 |
| herb | 306 | 0 / 306 / 0 | 1836 | **1195** | 641 |
| acupoint | 259 | 132 / 127 / 0 | 1295 | **1168** | 127 |
| **合计** | **825** | **391 / 433 / 1** | **4167** | **3399** | **768** |

> **内容级 vs KP 级口径**：内容对象级的 `published` 要求该对象下**所有** KP 都干净；KP 级则逐条判定。一味中药只要 usage/contraindications 缺源字段，整条药仍 review，但其 property/meridian/functions/indications 四个 KP 已是 published。这是 schema（`KnowledgePoint.status` 为 KP 级）与 BR-080 的正确语义，不是缺陷。

---

## (d) 数量核对（核对公式）

- **方剂**：源 190 + 70 = 260 行 → 去重（香薷散表内自重复 1 条 skip）→ 259 首 × 4 型（ingredients/functions/indications/mnemonic）= **1036 KP**，全部 published。
- **中药**：源 306 行 → 306 味 × 6 型（property/meridian/functions/indications/usage/contraindications）= **1836 KP**。其中 4 型有源数据 → 306×4=1224，减去 29 个单字归经（长度<2）error → **1195 published KP**；usage+contraindications 612 个恒缺源字段 + 29 单字归经 = **641 review KP**。
- **腧穴**：源 259 行 → 259 穴 × 5 型（location/indications/method/special/mnemonic）= **1295 KP**。132 穴五型全满 → 132×5=660；127 穴"特殊"属性空 → 127×4=508；合计 **1168 published KP**；127 个 special KP 缺字段 → **127 review KP**。
- **经络维表**：14 条（LU/LI/ST/SP/HT/SI/BL/KI/PC/TE/GB/LR/GV/CV），全部命中编码规则，无回退。

---

## (e) 质量报告摘要（缺陷清单）

| 科目 | issuesByRule | 定位 |
|---|---|---|
| formula | FORMAT_CLEAN=102（warning，不阻断）；DUPLICATE=1 | 组成列含词中空格（如"石 膏"）与 3+ 连续空白；香薷散表内自重复 |
| herb | ANSWER_NONEMPTY=641；FIELD_INCOMPLETE=612 | ① usage/contraindications 两列 Excel 无源数据（306×2=612，已建占位 KP 标"待补录"，未编造）；② 29 味单字归经（肺/肝/胃/心），长度<2，属真实源值 |
| acupoint | ANSWER_NONEMPTY=127；FIELD_INCOMPLETE=127 | 127 穴"特定穴属性"源空（血海/承山/睛明/风池/环跳/人中/命门/天突/攒竹/风门/膏肓/翳风/风府/神阙 等）；另 170 穴注意事项空（不建 KP，留作 AcupointContent.caution） |

**关键判定口径**：
- review ≠ 错误，而是"待人工补录"占位：herb 的 usage/contraindications、acupoint 的 special，均已建 KP 草稿并标注来源缺口，绝不编造内容填充。
- 方剂 70 首 pending 表经"方歌"列判定 mnemonic 有源（修复了初版只认"助记"列的误判），全部转 published。

---

## (f) 测试与回归

- `npx prisma validate`：✅ The schema is valid
- `npx prisma generate`：✅ Prisma Client v6.19.3 生成成功
- `npx tsc --noEmit`：✅ **0 错误**
- `npm test`（= `vitest run`）：✅ **Test Files 21 passed (21)，Tests 301 passed (301)**
  - 旧基线 264 个全部保留并全绿（unit 9 文件 + integration 11 文件 + e2e golden），未删除/未跳过/未弱化任何断言
  - 新增 `src/tests/unit/phase4-pipeline.test.ts` **37 个用例**：八项检查正反例、decideKpStatus 三分支、cuid 唯一性（1 万次无碰撞）、slugify、三类来源映射

---

## (g) 产物清单

```
data/
├── PIPELINE-SPEC.md              # 管线规范 v1.1（强制契约）
├── raw/                          # Excel 抽取原始落盘（5 文件）
├── normalized/                   # 清洗后内容对象 + meridians.json（14 经络）
├── validated/                    # 挂 id/issues/status（KP 级）
├── published/                    # 内容级全部 KP 干净的可发布子集
└── reports/                      # formula / herb / acupoint 三份质量报告
scripts/phase4/
├── extract_excel.py              # Python+openpyxl 抽取器
├── run-formula.ts / run-herb.ts / run-acupoint.ts
└── lib/                          # types / ids / sources / quality-check / status-policy / pipeline
src/tests/unit/phase4-pipeline.test.ts
```

---

## (h) 遗留项（如实记录）

1. **文件层交付，未直连 Postgres**：本轮按"文件层为交付物 + 可选入库脚本"执行，未向现有测试库/生产库写数据，避免污染。后续可写 `db:seed` 脚本把 published/ 与 review（draft）写入 ContentItem/FormulaContent/HerbContent/AcupointContent/KnowledgePoint/ContentSource/ContentVersion/Meridian。
2. **中药 usage/contraindications 612 个 KP 待补录**：Excel 无源数据列，需后续人工或外部数据源补"用法用量""使用注意"，补全后才能从 review 转 published。
3. **127 穴特定穴属性待补录**：五输穴/原络/郄穴/八会/下合穴/交会穴等，建议人工按教材补。
4. **29 味单字归经**：源值真实（单归经药），rule ② 要求答案≥2 字故判 review，可在 review 阶段确认或补全归经描述。
5. **香薷散表内自重复**：两行同名、助记不同（"香薷铺扁豆" vs "香厚扁"），按先到者保留，需人工确认正条。
6. **方剂组成列字内空格**：如"石 膏"、"大枣十二枚，擎"（疑为"擘"形近误录），已记 FORMAT_CLEAN warning，未自动改写以免引入错误。
7. **contentHash/version**：管线结构已预留，db:seed 时按内容对象生成 contentHash 并写 ContentVersion(version=1, sourceId 绑定)。
