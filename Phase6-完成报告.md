# Phase 6 完成报告 —— Question Engine（题目引擎）

> 范围：`src/modules/question/**` 及其测试。严格未触碰 `prisma/schema.prisma` 与 `src/modules/identity/**`，未跑 `prisma generate`、未跑全量 `npm test`。
> 时间：2026-09-18。基线：改动前 `npx tsc --noEmit` 0 错误、question 相关测试全绿。

---

## ① 验收 checklist 逐条证据

### 1. 三题型端到端（模板实例化→渲染→落库→作答→评价）；ordering 显式报错

- **落库指针**：`GenerateQuestion` 内 `saveInstance(instance)` 写入 `knowledgePointId + templateId + sequence`，并回写 `SessionItem.questionInstanceId`（P1-9）。
  证据：`question-engine-e2e.test.ts`「free_recall…落库实例指针完整」断言 `instance.knowledgePointId/templateId/sequence(0)`、`qStore.instances.size===1`、`sessionItems.get("item-1").questionInstanceId==="qi-1"`。
- **三题型渲染**：`GenerateQuestionDeps.registry` 存在时，落库后即时渲染 `RenderedQuestion`（`stem/options/acceptedAnswers/blanks`）。
- **ordering 不退化**：注册表 `buildDefaultQuestionRegistry()` 故意不登记 `ordering`；`GenerateQuestion` 在**写库之前**做注册表门控，命中未登记题型抛 `ValidationError("…尚未落地出题器（不静默退化为 free_recall）")`。
  证据：「ordering…显式报错且不落实例」断言 rejects `/ordering|出题器/` 且 `qStore.instances.size===0`（门控先于写库，无孤儿实例）。
- **缺模板**：「缺模板：未配置题型模板时显式报错」断言 rejects `/模板/`。

### 2. 确定性生成优先

- **free_recall**（`FreeRecallGenerator`）：题干固定 `复述：{title}`，答案取 `canonicalAnswer`，按 `config.separator`（缺省 `/、|`）拆候选。
- **fill_blank**（`FillBlankGenerator` + `resolveFillBlankSlots`）：从 `canonicalAnswer` 按 `itemSeparator`（缺省 `、`）拆结构化项，挖去第 `blankIndex` 项（缺省 `sequence % 项数`），题干把该项替换为 `____`，正确答案=被挖项，`accept` 并入同义词。
  证据：「fill_blank…」断言 `stem === "____、桂枝、杏仁、甘草"`，`accept` 同时含 `麻黄` 与 `炙麻黄`。
- **recognition**（`RecognitionGenerator`）：正确项=`canonicalAnswer`；干扰项=`config.distractors` ∪ 同类型其他已发布 KP 的 canonical（经 `findSiblings` 注入），归一化去重并剔除与正确项相同者；选项按 FNV-1a 稳定哈希排序，`correctIndex` 可复现。
  证据：「recognition…」断言选项含 `麻黄汤/桂枝汤/银翘散`、`correctIndex` 指向 `麻黄汤`、选项归一化后无重复。

### 3. 三科目 Evaluator 统一契约 + BR-022

- `FormulaEvaluator / HerbEvaluator / AcupointEvaluator` 继承 `SubjectEvaluator`，共享纯比对引擎，差异仅在科目级同义词表，统一返回 `EvaluationResult{score,isCorrect,confidence,feedback}`。
  - free_recall：`scoreFreeRecall` —— NFKC + 去空白/中英文标点 + 小写，`/、|` 多候选，命中比例阈值 `requiredRatio`。
  - fill_blank：`scoreFillBlank` —— 逐空归一化精确匹配，`accept` 同义词数组任一命中即对，得分=答对空位数/总空位数。
  - recognition：`scoreRecognition` —— 用户所选与正确项归一化精确相等。
- **BR-022 零 LearningState 修改**：
  - 源码 grep `src/modules/question/**` 对 `LearningState/learningState/reviewEvent/ReviewEvent` 仅 3 处**注释**命中，无任何代码引用；`subject-evaluators.ts` 只 `import type` 了 `EvaluationResult` 与 `Evaluator` 接口，无 Repository、无写操作。
  - 测试证据：free_recall 错误用例与三科目用例均断言 `store.learningStates.size === 0`。

### 4. AI 生成边界（本轮不做）

- 本轮**不实现** AI 兜底生成路径。
- 已按 `question-model.md §5` 预留：`rendered-question.ts` 顶部注释说明"AI 兜底（Phase 11）将复用同一组渲染结构并经 §5 校验（指向已发布知识点 / 题型合法 / 答案可验证 / 无医疗违规）"；`generate-question.ts` 的 `GenerateQuestionResult.question` 注释同样标注。
- 结论：**AI 兜底生成留待 Phase 11**。

### 5. 题型扩展解耦（注册表）

- `src/modules/question/domain/registry.ts`：`Map<QuestionType, { generator }>`，`buildDefaultQuestionRegistry()` 登记 free_recall/fill_blank/recognition，ordering 预留不登记。
- 评分侧同样按 `questionType` switch 路由到纯比对函数；新增题型=加一条注册表项 + 一个 Evaluator 分支，**不改 Scheduler/FSRS/LearningState/ReviewEvent**（BR-040/BR-022）。

### 6. 测试覆盖（`question-engine-e2e.test.ts`，8 用例）

| 用例 | 覆盖点 |
|---|---|
| free_recall 归一化容差判对 | 标点/空白/全角/小写 + 落库指针 + 回写 |
| free_recall 错误作答 | isCorrect=false、score=0、参考答案反馈、零 LearningState |
| free_recall 多候选 + requiredRatio | `/` 分隔同义候选命中比例（0.5），无关答案判错 |
| fill_blank | canonical 正确 / 同义词正确 / 错误判错 + 反馈正确答案 |
| recognition | 正确项+干扰项、干扰项不含正确答案、选对/选错两路径 |
| ordering | 显式报错且不落实例 |
| 缺模板 | 显式报错 |
| 三科目统一契约 | AcupointEvaluator 全角+小写判对、EvaluationResult 四字段、零 LearningState |

### 7. question-model.md §2/§3 一致性落点

| 规格 | 实现落点 |
|---|---|
| §2.1 QuestionTemplate（knowledgePointType/type/difficulty/config/enabled，@@unique） | 复用既有 `domain/question.ts` + `prisma-question-repository.ts`，未改 schema |
| §2.2 QuestionInstance（sessionItemId/knowledgePointId/templateId/sequence/generatedAt） | `GenerateQuestion` 落库，测试断言三指针 |
| §2.3 QuestionEvaluator→EvaluationResult | `scoring.ts` 纯函数 + `subject-evaluators.ts` 三科目类 |
| §3.1 free_recall（复述 title、/| 多候选、requiredRatio） | `FreeRecallGenerator` + `scoreFreeRecall` |
| §3.2 fill_blank（____ 空位、accept 同义词数组、挖一味药） | `FillBlankGenerator` + `resolveFillBlankSlots` + `scoreFillBlank` |
| §3.3 recognition（单选、正确项+同类型干扰项、精确匹配） | `RecognitionGenerator` + `scoreRecognition` |
| §3.4 ordering 不退化 | 注册表门控显式报错 |
| §6 题型扩展解耦 | `registry.ts` |

---

## ② 新增/修改文件清单

**新增（7）**
- `src/modules/question/domain/rendered-question.ts` —— 渲染题结构（free_recall/fill_blank/recognition 判别联合）
- `src/modules/question/domain/scoring.ts` —— 归一化 + 三题型纯评分函数
- `src/modules/question/domain/template-config.ts` —— config 安全解析 + 确定性挖空求解（生成/评分同源）
- `src/modules/question/domain/generator.ts` —— 三题型确定性出题器
- `src/modules/question/domain/registry.ts` —— 题型注册表
- `src/modules/question/application/subject-evaluators.ts` —— Formula/Herb/Acupoint 三科目 Evaluator
- `src/tests/integration/question-engine-e2e.test.ts` —— 8 个端到端用例

**修改（3）**
- `src/modules/question/application/generate-question.ts` —— 可选 `registry/findSiblings/synonyms`，落库后渲染，ordering 门控先于写库
- `src/modules/learning/application/evaluator.ts` —— `EvaluationContext` 增加可选 `templateConfig/instanceSequence`（向后兼容，旧 `CanonicalMatchEvaluator` 不感知）
- `src/modules/learning/application/evaluate-attempt.ts` —— 消除 `template?.type ?? "free_recall"` 静默退化：缺模板显式 `NotFoundError`，并把 `template.config/instance.sequence` 下传评分器

> 既有 `question-engine.test.ts`（4 用例）未改动、未弱化，仍全绿。

---

## ③ 测试结果（真实输出）

### `npx tsc --noEmit`
```
===TSC EXIT 0===
```
0 错误。

### `npx vitest run src/tests/integration/question-engine-e2e.test.ts src/tests/integration/question-engine.test.ts src/tests/integration/learning-flow.test.ts`
```
 ✓ src/tests/integration/question-engine.test.ts (4 tests) 13ms
 ✓ src/tests/integration/question-engine-e2e.test.ts (8 tests) 23ms
 ✓ src/tests/integration/learning-flow.test.ts (9 tests) 24ms

 Test Files  3 passed (3)
      Tests  21 passed (21)
   Duration  7.98s
```
- 既有 `question-engine.test.ts` 4 用例：通过（未删未改）。
- 新增 e2e 8 用例：全部通过。
- 因改动了 `evaluate-attempt.ts`，连带回归 `learning-flow.test.ts` 9 用例：全部通过（含黄金 Submit→Evaluate→Review 链路）。

---

## ④ 遗留项

1. **AI 兜底生成**：留待 Phase 11；已在 `rendered-question.ts` / `generate-question.ts` 按 §5 预留校验接口与注释。
2. **ordering 题型**：枚举保留，本轮不落地出题器/评分器；注册表不登记即显式报错。
3. **干扰项 DB 来源**：当前通过可选注入端口 `findSiblings` 取同类型已发布 KP；`KnowledgePointRepository` 暂未加 `findPublishedByType`（避免越界改 knowledge 模块接口），生产接线时可补该方法并接入。
4. **多空位 fill_blank**：`scoreFillBlank` 已支持多空（数组或按 `、，;|` 拆分），本轮测试以单空为主，多空可在后续补充用例。
5. 未跑全量 `npm test`、未跑 `prisma generate`，按要求交由你统一回归。
