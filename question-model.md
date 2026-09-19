# Question Model —— 题目领域模型规格（P2-7）

> 版本：Phase 1 / v2
> 对应代码：`src/modules/question/domain/question.ts`、`src/modules/question/domain/question-repository.ts`、`src/modules/question/application/generate-question.ts`、`prisma/schema.prisma`（QuestionTemplate / QuestionInstance）
> 配套模型：learning-model（学习调度）、knowledge-model（知识点）、evaluation（评价）
> 本文档钉死题型枚举、payload 形态与分题型评分规则，使"题型扩展无需改学习引擎"可被验收（综合审核报告 P2-7）。

---

## 1. 概述与定位

题目引擎回答的问题是：**"如何对一个知识点做记忆测验？"**

它位于学习闭环的中游，承接知识点、驱动一次作答与评价：

```
KnowledgePoint ──► QuestionTemplate ──► QuestionInstance ──► Attempt ──► Evaluation
（知识来源）        （出题规则/评分逻辑） （一次具体提问）        （用户作答） （系统评分）
```

- **KnowledgePoint**：最小记忆单元，持有 `canonicalAnswer` 与结构化字段（如 `formula.ingredients`），是题目的**唯一知识来源**。
- **QuestionTemplate**：某个知识点类型（`knowledgePointType`）+ 某个题型（`type`）的出题与评分规则。
- **QuestionInstance**：一次学习会话（SessionItem）中，针对某个具体知识点生成的一道具体题目。
- **Attempt**：用户对该题的一次真实作答（事实记录，BR-003 / BR-011）。
- **Evaluation**：QuestionEvaluator 对作答的评分结果（BR-020 / BR-021 / BR-022）。

**核心定位**：题目扩展（新增题型、新增出题方式）**不改变学习引擎核心**。Scheduler / FSRS / LearningState / ReviewEvent 均不感知题型——它们只消费 `Evaluation.isCorrect` 与 `ReviewRating`，不关心题是怎么出的、怎么判的（BR-022：Evaluation 不直接更新 LearningState）。

---

## 2. 核心实体定义

### 2.1 QuestionTemplate（题目模板）

定义某知识点类型下某题型的**生成规则与评分逻辑**。`(knowledgePointType, type)` 唯一（`@@unique`）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 主键（cuid） |
| `knowledgePointType` | `KnowledgePointType` | 适用的知识点类型，如 `formula.ingredients`、`herb.property` |
| `type` | `QuestionType` | 题型枚举：`free_recall` / `fill_blank` / `recognition` / `ordering` |
| `difficulty` | `number` | 模板默认难度（0~1），实例可覆盖 |
| `config` | `unknown`（JSON） | 题型专属参数（题干模板、干扰项池、候选答案分隔符等），按题型约定 schema |
| `enabled` | `boolean` | 是否启用；未启用模板不得用于出题（`GenerateQuestion` 校验） |

- 唯一性约束：`UNIQUE(knowledgePointType, type)`——同一知识点类型下同一种题型只有一个模板。
- `config` 是无固定 schema 的 `Json?`，其结构由各题型规格（§3）自行约定；领域代码不做泛型强约束，由出题器/评分器各自解释。

### 2.2 QuestionInstance（题目实例）

一次学习会话中，针对具体知识点生成的一道**具体题目**。模板是"方式"，实例是"这道题"。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 主键 |
| `sessionItemId` | `string` | 所属 SessionItem（与 SessionItem 1:1 回写 `questionInstanceId`，P1-9 闭合链路） |
| `knowledgePointId` | `string` | 指向的 canonical KnowledgePoint |
| `templateId` | `string` | 所用 QuestionTemplate |
| `sequence` | `number` | 同一 SessionItem 下的题号，按已有实例数自增 |
| `generatedAt` | `Date` | 生成时间 |

- 实例本身只存"指针"（指向哪个知识点、哪个模板、第几题）；渲染后的题干/选项在生成时由出题器依据 `KnowledgePoint` 结构化字段即时产出，或由 AI 生成后落库（见 §4 / §5）。
- `GenerateQuestion` 在事务内：校验知识点已发布 → 取启用模板 → 自增 sequence → 落实例 → 回写 `SessionItem.questionInstanceId`（BR-012 幂等由 `clientRequestId` 层兜底，题目生成本身不重复）。

### 2.3 QuestionEvaluator（评分器接口）

每种题型有对应实现，统一输出 `EvaluationResult`（BR-021）：

```text
evaluate(instance, userAnswer) → EvaluationResult
```

`EvaluationResult` 契约（与 `src/modules/learning/domain/evaluation.ts` 一致）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `score` | `number` | 0~1 得分 |
| `isCorrect` | `boolean` | 是否正确（系统判断，独立于用户记忆评级，BR-020 / BR-022） |
| `confidence` | `number` | 评分器置信度 |
| `feedback` | `string \| null` | 反馈/参考答案 |

- 评分器**只评分，不更新任何状态**（BR-022）：它产出 `Evaluation`，后续 `FinalizeReview` 才把 `ReviewRating` 转成 FSRS 调度。
- 当前默认实现 `CanonicalMatchEvaluator`：将 `userAnswer` 与 `canonicalAnswer` 归一化（NFKC + 去标点空白 + 小写）后做包含匹配，支持多候选（`/`、`|` 分隔）与命中比例阈值。分题型评分器在 §3 约定。

---

## 3. 三种初始题型规格

`QuestionType` 枚举（`schema.prisma:30-35` / `question.ts:8`）：`free_recall`、`fill_blank`、`recognition`、`ordering`。本轮定义前三种；`ordering` 为预留扩展，本轮不定详细规格。

### 3.1 free_recall（自由回忆）

- **作答形态**：开放作答，用户自由输入文本。
- **评分**：基于 `KnowledgePoint.canonicalAnswer` 做语义/关键词匹配。默认走 `CanonicalMatchEvaluator`：归一化后候选答案包含匹配，支持多组同义答案（分隔符 `/`、`|`）与命中比例阈值。
- **`config` 约定**：`{ "separator": "[/|]", "requiredRatio": 1 }`（可缺省，缺省即默认值）。
- **生成**：确定性生成——题干固定为"复述 {KnowledgePoint.title}"，答案取自 `canonicalAnswer`。

### 3.2 fill_blank（填空）

- **作答形态**：题干含空位（`____`），用户在空位处填答。
- **评分**：答案**精确匹配**（归一化后相等），支持**多答案 / 同义词**（任一候选命中即正确）。
- **`config` 约定**：`{ "blanks": [{ "slot": "____", "accept": ["麻黄", "…同义词…"] }] }`，`accept` 为可接受答案数组。
- **生成**：确定性生成优先——如 `formula.ingredients` 题型，从 `formula.ingredients` 结构化字段中挖去一味药生成空位，正确答案即被挖去的那味药。

### 3.3 recognition（识别 / 选择）

- **作答形态**：选择题（单选），用户从选项中选出正确项。
- **评分**：**精确匹配正确选项**（用户所选选项 === 正确选项）。
- **`config` 约定**：`{ "options": [...], "correctIndex": n, "distractors": [...] }`。
- **生成**：正确项来自 `canonicalAnswer`；干扰项从**同知识点类型**的其他已发布知识点的 canonical 字段生成（如同科目其他方剂的组成药），保证干扰项"看起来合理但确实错"。

### 3.4 ordering（排序）—— 预留

本轮**不定义**详细规格。枚举中保留该值以预留扩展位；在对应模板/评分器落地前，`GenerateQuestion` 对该 type 应返回"无可用模板"错误，不得静默退化为 `free_recall`（综合审核报告问题点：`evaluate-attempt.ts` 缺模板时静默退 `free_recall` 需在 Phase 6 前改为显式校验）。

---

## 4. 确定性生成优先原则（对应 learning-model §5）

1. **优先确定性生成**：优先从 `KnowledgePoint.canonicalAnswer` 与结构化字段（如 `formula.ingredients`）**确定性**生成题目。例如填空从 `formula.ingredients` 挖空、识别题的正确项取 `canonicalAnswer`、干扰项从同类型知识点确定性采样。
2. **AI 生成仅作兜底**：当确定性生成不可用（知识点缺少结构化字段、无法挖空/构造干扰项）时，才允许 AI 生成题目。AI 生成**不是首选路径**。
3. **AI 不触碰学习状态**：题目生成（无论确定性还是 AI）**不直接修改 `LearningState`**。AI 模块零 `LearningState` 引用（BR-100 / BR-101）；只有 `FinalizeReview` 依据 `ReviewRating` 经 Scheduler 推进记忆状态。
4. **幂等**：题目生成本身不引入二次推进；同一 `SessionItem` 的重复出题由 `sequence` 与 `clientRequestId` 幂等机制控制（BR-012）。

---

## 5. AI 生成题目校验规则

AI 兜底生成的题目**必须经过校验**，不可验证的 AI 输出应被拒绝：

| # | 校验规则 | 拒绝条件 |
|---|---|---|
| 1 | 指向已发布知识点 | 题目指向的 `knowledgePointId` 不存在，或 `KnowledgePoint.status !== "published"`（`GenerateQuestion` 已抛 `NotFoundError` / `ContentNotPublishedError`） |
| 2 | 题型合法 | `type` 必须是 `QuestionType` 枚举中的合法值（`free_recall` / `fill_blank` / `recognition` / `ordering`），非法题型拒绝 |
| 3 | 答案可验证 | 题目答案必须能被对应 `QuestionEvaluator` 验证（有 `canonicalAnswer` 可比对 / 有空位可精确匹配 / 有正确选项可比对）；无法验证的 AI 输出拒绝 |
| 4 | 无医疗违规 | 题目内容不得包含医疗违规内容，复用 `MedicalOutputValidator` / `KeywordMedicalSafetyFilter`（BR-100，P0-1 / P2-11） |

> AI 边界同时受运行时守卫保护：输入侧 `PromptInjectionDetector` 拦截指令劫持，输出侧 `AiOutputGuard` 拦截医疗违规并以免责声明替换（见 `src/modules/ai/domain/safety.ts`）。

---

## 6. 题型扩展机制

新增题型是**纯加法**，不影响学习引擎：

1. 在 `QuestionType` 枚举与 `question.ts` 中登记新题型。
2. 实现该题型的 `QuestionTemplate.config` schema（题干模板 / 答案/选项/干扰项约定）。
3. 实现对应的 `QuestionEvaluator`（输出统一 `EvaluationResult`，BR-021）。
4. （可选）实现确定性出题器；否则走 AI 兜底并套用 §5 校验。

**不变量**：Scheduler / FSRS / LearningState / ReviewEvent / StudyDay **均不感知题型**。它们只消费 `Evaluation.isCorrect` 与 `ReviewRating`，因此新增题型零改动学习引擎核心（BR-040 LearningState 唯一、BR-022 评价不写状态）。

---

## 7. 与其他模型的关系

| 关系 | 基数 | 说明 |
|---|---|---|
| `QuestionInstance` — `SessionItem` | 1:1 | 一个 SessionItem 当前持有一道题（`SessionItem.questionInstanceId` 回写，P1-9）；实例侧记 `sessionItemId` |
| `QuestionInstance` — `Attempt` | 1:N | 一道题可被多次作答（重复练习）；`Attempt.questionInstanceId` 指向实例 |
| `KnowledgePoint` — `QuestionInstance` | 1:N | 知识点是题目的知识来源；实例记 `knowledgePointId`，出题与评分均回到 canonical 字段 |
| `QuestionTemplate` — `QuestionInstance` | 1:N | 一个模板可生成多道实例；实例记 `templateId` |
| `QuestionEvaluator` → `Evaluation` | — | 评分器产出 `Evaluation`（`attemptId` 唯一，BR-030），不写 `LearningState`（BR-022） |

**关键跨模型约束**：

- 评价与评级分离（BR-020 / BR-022）：`Evaluation.isCorrect` 是系统对错判断，独立于用户在 `FinalizeReview` 给出的 `ReviewRating`；不得用评级反推正确率（P1-10）。
- 作答是事实记录（BR-003 / BR-011）：`Attempt` 提交后不被重新解释；状态机 `submitted → evaluated → reviewed` 严格单调（BR-013）。
- AI 不写 canonical / 学习状态（BR-100 / BR-101）：题目生成与 AI 咨询均不得直接改 `LearningState` 或 canonical 知识点。

---

*本文档术语与 `src/modules/question`、`src/modules/learning/domain`、`src/modules/knowledge/domain` 代码一致；BR 编号回指代码注释与 `FixLog-P0P1.md` 既有体系。*
