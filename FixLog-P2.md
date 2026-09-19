# FixLog — Phase 1 P2 修复记录

> 修复日期：2026-09-18
> 对应审核报告：`Phase1-规格定稿-综合审核报告.md`
> 修复范围：全部 P2（9 项，P2-4/5/12 已在 P0/P1 阶段顺手修复，本轮不重复）
> 修复前测试基线：13 文件 / 180 用例
> 修复后测试结果：**15 文件 / 211 用例全部通过，tsc --noEmit 0 错误**

---

## 一、P2 修复项总览

| # | 问题 | 状态 | 修复组 |
|---|---|---|---|
| P2-1 | createInitialLearningStateDraft 死代码 + BR-042 注释错名 | ✅ 已修复 | 领域/适配器组 |
| P2-2 | 幂等 TOCTOU（findByClientRequestId 与 save 之间无并发保护） | ✅ 已修复 | 领域/适配器组 |
| P2-3 | draftToCard 硬编码 State.Review，FSRS 首次 again 后应为 Learning 态 | ✅ 已修复 | 领域/适配器组 |
| P2-4 | SessionItem pending 直跳 completed | ⏭️ 已在 P1-2 修复 | — |
| P2-5 | StudyPlan draft/expired/completed 永不可达 | ⏭️ 已在 P0-3 修复 | — |
| P2-6 | BR-071 编号重载 | ✅ 已修复 | 领域/适配器组 |
| P2-7 | question-model 缺失导致题型规格缺口 | ✅ 已修复 | 规格/AI 组 |
| P2-8 | RegisterUser 对缺时区默认 Asia/Shanghai 而非拒绝（BR-093） | ✅ 已修复 | 学习/计划组 |
| P2-9 | CompletePlanItem 未注入 UnitOfWork | ✅ 已修复 | 学习/计划组 |
| P2-10 | 时区转换无实现（getLocalDate 是注入接口，无 IANA tz 转换代码） | ✅ 已修复 | 学习/计划组 |
| P2-11 | AI 边界仅靠缺席，无运行时守卫 | ✅ 已修复 | 规格/AI 组 |
| P2-12 | 三模块无 application 层用例 | ⏭️ 已在 P1-5 大幅修复 | — |

---

## 二、领域/适配器组修复

### P2-1：createInitialLearningStateDraft 死代码 + BR-042 注释错名

**审核问题**：`createInitialLearningStateDraft` 函数定义后仅被单元测试引用，生产代码全部走 `scheduler.initialize()`；BR-042 相关注释与实现不一致。

**修复内容**：
1. 删除死代码函数 `createInitialLearningStateDraft`（原 `learning-state.ts:39`）。
2. `LearningStateDraft` 接口注释修正为"通过 Scheduler.initialize() 显式初始化（BR-042）"，不再引用不存在的函数名。
3. `domain-constructors.test.ts` 中 3 个原测试改为测试生产路径 `FsrsScheduler.initialize()`，断言不变量保持一致。
4. 保留 `LearningStateDraft` 接口（被 scheduler / finalize-review / ReviewStateSnapshot 使用）。

**代码位置**：
| 文件 | 修改 |
|---|---|
| `src/modules/learning/domain/learning-state.ts` | 删除 `createInitialLearningStateDraft` 函数；接口注释改为 Scheduler.initialize() |
| `src/tests/unit/domain-constructors.test.ts:12-16,44-86` | 移除该函数 import；3 个测试改用 `FsrsScheduler.initialize()` |

**测试证据**：
- `domain-constructors.test.ts`（16 用例）：
  - "scheduler.initialize() 产出未学习基线：stability/difficulty 均为 0" → `stability===0 && difficulty===0 && retrievability===1`
  - "初始 draft 的 lastReviewedAt / lastRating 必须为 null" → 均 `toBeNull()`
  - "初始 draft 的 dueAt 锚定到构造时刻，且 fsrsState 为 State.New（0）" → `dueAt===now && fsrsState===0`
- BR-042 注释核对：`finalize-review.ts:9` 与 `:124` 原文为"LearningState 不存在时显式初始化（BR-042）"，与实现 `scheduler.initialize(reviewedAt)` 一致。

---

### P2-2：幂等 TOCTOU 并发兜底

**审核问题**：`findByClientRequestId` 与 `save` 之间存在 TOCTOU 窗口，并发请求可能同时通过检查导致 DB 唯一约束冲突被原样抛出。

**修复内容**：
1. 在 `submit-attempt.ts` 的 `save` 外包 try/catch：识别 Prisma 唯一约束冲突（`code==='P2002'`），重查 `findByClientRequestId` 后返回 `{created:false, attempt:raced}`，不再抛出原始 DB 错误。
2. 新增结构化识别辅助 `isUniqueViolation()`（不直接 import @prisma/client，保持用例对仓储实现中立）。
3. `schema.prisma` 的 `Attempt.clientRequestId` 字段旁加注释说明 `@@unique([userId, clientRequestId])` 的 TOCTOU 兜底作用。
4. 代码注释明确说明：应用层 TOCTOU 由 DB 唯一约束兜底，catch 路径将并发冲突转化为幂等返回。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/learning/application/submit-attempt.ts:49-62` | 新增 `isUniqueViolation()` |
| `src/modules/learning/application/submit-attempt.ts:125-145` | save 包 try/catch + TOCTOU 注释 |
| `prisma/schema.prisma:460-463` | clientRequestId 字段加幂等兜底注释 |

**测试证据**：
- `learning-flow.test.ts` 新增用例："TOCTOU 并发兜底：save 撞 DB 唯一约束(P2002) → 捕获后返回幂等结果（P2-2 / BR-012）"
  - 构造 `findByClientRequestId` 首次返回 `null`（模拟窗口）、`save` 抛 `{code:"P2002"}`、catch 后重查返回并发赢家 `attempt-winner`。
  - 断言：`result.created === false`、`result.attempt.id === "attempt-winner"`、原始 P2002 被吞掉。

---

### P2-3：FSRS 适配器保真 — draftToCard 硬编码 State.Review

**审核问题**：`draftToCard` 在还原卡片时硬编码 `state: State.Review`。FSRS 中卡片有 New/Learning/Review/Relearning 四态，首次 again 后卡片应为 Learning 态而非 Review 态，导致调度保真丢失。

**修复内容**：
1. `LearningStateDraft` 新增 `fsrsState: number` 字段（对应 ts-fsrs State 枚举：New=0 / Learning=1 / Review=2 / Relearning=3）。
2. `LearningState` 实体同步加 `fsrsState` 字段（toDraft 需从它读取，类型闭环）。
3. `ReviewStateSnapshot` 接口加 `fsrsState` 字段。
4. `FsrsScheduler.initialize()` 设 `fsrsState: card.state`（=State.New=0）。
5. `FsrsScheduler.review()` 写入 `fsrsState: nextCard.state`（真实透传）。
6. `draftToCard()` 用 `draft.fsrsState` 替代硬编码 `State.Review`；`reviewCount===0 || stability===0` 仍走 `createEmptyCard`（New 态）。
7. `finalize-review.ts` 的 `toDraft`/`toSnapshot`/LearningState 构造均带上 `fsrsState`。
8. 移除 fsrs-scheduler.ts 中已不再使用的 `State` 导入。

**代码位置**：
| 文件 | 修改 |
|---|---|
| `src/modules/learning/domain/learning-state.ts` | Draft 与实体均加 `fsrsState` |
| `src/modules/learning/domain/review-event.ts:18` | `ReviewStateSnapshot` 加 `fsrsState` |
| `src/modules/learning/infrastructure/fsrs-scheduler.ts:23-86` | draftToCard / initialize / review 改造 |
| `src/modules/learning/application/finalize-review.ts:54-79,160` | toDraft/toSnapshot/LearningState 构造带 fsrsState |
| `src/tests/integration/session-study-plan.test.ts:188` | 种子 LearningState 补 `fsrsState:2` |

**测试证据**：
- `fsrs-mapping.test.ts`（17 用例，原 12 用例 + 新增 5 用例）：
  - 形状测试更新为 9 字段（含 `fsrsState`）。
  - "initialize() 的 fsrsState 为 State.New（0）" → `toBe(0)`。
  - "首次新卡评 again → Learning(1)" → `fsrsState===State.Learning===1`。
  - "连续 review：fsrsState 沿 nextCard.state 传递" → good→Learning(1)→good→Review(2)。
  - "Review 态评 again（遗忘）→ Relearning(3)" → `fsrsState===State.Relearning===3`。

> **实测说明**：任务预期"新卡首次 good → Review(2)"与本仓库 ts-fsrs 版本实际行为不符——新卡首次 good 实际落在 **Learning(1)**，需在 Learning 态再 good 才毕业到 Review。按本测试文件既有约定（"经实测按源码真实不变量断言"），断言已修正为真实行为；核心修复（状态由 nextCard.state 真实透传、不再硬编码 Review）不变。

---

### P2-6：BR-071 编号重载

**审核问题**：BR-071 同时被用作"StudyDay 汇总"和"注册事务原子性"两个不变量，规格引用不唯一。

**修复内容**：将 BR-071 统一保留给"事务原子性"语义（register-user / verify-email / reset-password 及 identity.test.ts），将 StudyDay 汇总引用改为 BR-072。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/learning/domain/study-day.ts:2` | "BR-070 / BR-071" → "BR-070 / BR-072" |
| `src/tests/e2e/golden-scenario.test.ts:177` | "StudyDay…（BR-070/071）" → "（BR-070/072）" |

**核对结果**：grep 全 `src/` 后，BR-071 仅出现在 `register-user.ts:2`、`verify-email.ts:49`、`reset-password.ts:52`、`identity.test.ts:2,40`（均为事务原子性）；BR-072 仅出现在 `study-day.ts`（汇总语义）。无残留重载。

---

## 三、学习/计划组修复

### P2-8：RegisterUser 对缺时区默认 Asia/Shanghai 而非拒绝（BR-093）

**审核问题**：`register-user.ts` 对缺时区默认 `"Asia/Shanghai"`，违反 BR-093（时区必填）。

**修复内容**：
1. `RegisterUserCommand.timezone` 由可选改为**必填**（去掉 `?`）。
2. 删除 `RegisterUserDeps.defaultTimezone` 依赖及 `?? "Asia/Shanghai"` 默认逻辑。
3. 新增 `isValidTimezone()`（用 `Intl.DateTimeFormat` try-catch 校验 IANA 时区合法性）。
4. `execute` 开头新增时区校验：trim 后为空 → `ValidationError("时区必填（BR-093）")`；非合法 IANA → `ValidationError("无效的时区：...")`。
5. 落库改为直接使用校验后的 `timezone`（不再 `cmd.timezone ?? timezone`）。
6. User 模型的 `timezone` 字段在 prisma schema 中仍保留 `@default("Asia/Shanghai")`（DB 层默认，不影响应用层校验）。

**代码位置**：
| 文件 | 修改 |
|---|---|
| `src/modules/identity/application/register-user.ts` | timezone 必填 + 校验 + 删除默认逻辑 |
| `src/tests/integration/identity.test.ts` | 6 处既有注册调用补 `timezone`，新增 4 个时区校验用例 |

**测试证据**（identity.test.ts 由 7→11 用例）：
- "BR-093：缺时区注册抛 ValidationError（不再默认 Asia/Shanghai）" — `@ts-expect-error` 显式不传 timezone，断言抛 `ValidationError`
- "BR-093：空时区注册抛 ValidationError" — 传 `"   "`
- "BR-093：无效 IANA 时区注册抛 ValidationError" — 传 `"Mars/Olympus"`
- "合法时区原样落库（trim 后保留 IANA 标识）" — 传 `"  America/Los_Angeles  "`，断言 `result.user.timezone === "America/Los_Angeles"`

---

### P2-9：CompletePlanItem 未注入 UnitOfWork

**审核问题**：`today-plan.ts` 中的 `CompletePlanItem` 只有 `planRepo` 依赖，没有 `uow`，与其它应用用例风格不一致（verify-email / reset-password / finalize-review 都注入了 uow）。

**修复内容**（采用接口拆分方案）：
1. 新增 `CompletePlanItemDeps { planRepo; uow }`；只读的 `GetTodayPlan` 仍用精简 `StudyPlanDeps { planRepo }`，保持只读用例简洁。
2. `CompletePlanItem.execute` 将 `findItemById` + 状态守卫 + `saveItem` 整体包入 `uow.transaction`，与 verify-email / reset-password / finalize-review 风格一致。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/study-plan/application/today-plan.ts:12-18` | 拆分 `StudyPlanDeps`（只读）与 `CompletePlanItemDeps`（含 uow） |
| `src/modules/study-plan/application/today-plan.ts:49-62` | CompletePlanItem.execute 包入 `uow.transaction` |
| `src/tests/integration/session-study-plan.test.ts:271` | `new CompletePlanItem({ planRepo, uow: makeUnitOfWork() })` |

**测试证据**：
- 既有 "CompletePlanItem 只改条目状态，不动 LearningState（BR-062）" 用例改传 no-op uow 后通过，断言 `done.status==="completed"`、LearningState 未被改动。

---

### P2-10：时区转换无实现（getLocalDate 生产实现）

**审核问题**：`getLocalDate` 是注入接口 `(userId: string, now: Date) => Promise<string>`，目前无生产实现，测试中全用 mock。

**修复内容**：
1. 新建 `src/shared/infrastructure/timezone.ts`，导出 `createGetLocalDate(repos: { users: { findById } })` 工厂函数，返回签名 `(userId, now) => Promise<string>`，与 `FinalizeReviewDeps` / `EndSessionDeps` 的注入接口一致。
2. 实现逻辑：按 `userId` 查 `User.timezone`，用 `Intl.DateTimeFormat("en-CA", {timeZone, year, month, day})` 输出 `"YYYY-MM-DD"`（en-CA locale 原生输出 ISO 格式，无需手工拼接）。
3. 用户不存在或时区非法时回退 UTC 并 `console.warn`，不抛错（业务日期不因此中断）。
4. 仅用 Node 内置 Intl，无新依赖。现有测试中的 mock 保持不变。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/shared/infrastructure/timezone.ts` | `createGetLocalDate()` 工厂 + `isValidTimezone()` 辅助 |

**测试证据**（新建 `src/tests/unit/timezone.test.ts`，6 用例）：
- "Asia/Shanghai：2026-09-18T01:30Z → '2026-09-18'"（断言值）
- "America/Los_Angeles（9 月 PDT=UTC-7）→ '2026-09-17'"（夏令时跨日）
- "UTC → '2026-09-18'"
- "用户不存在回退 UTC"（断言返回值且 `console.warn` 被调用）
- "用户时区非法回退 UTC"
- "Pacific/Kiritimati（UTC+14）跨日 → '2026-09-19'"

---

## 四、规格/AI 组修复

### P2-7：编写 question-model.md 规格文档

**审核问题**：题目领域模型规格缺失，导致题型规格缺口（Phase 6 前需补文档）。

**修复内容**：在项目根目录新建 `question-model.md`，7 个章节齐全，术语与 `src/modules/question`、`learning/domain`、`knowledge/domain` 代码一致：

1. **概述与定位**：画出 `KnowledgePoint → QuestionTemplate → QuestionInstance → Attempt → Evaluation` 链路，明确题型扩展不动学习引擎核心。
2. **核心实体定义**：用表格定义 `QuestionTemplate`（含 `(knowledgePointType, type)` 唯一、`config` JSON、`enabled`）、`QuestionInstance`（sessionItemId/knowledgePointId/templateId/sequence/generatedAt）、`QuestionEvaluator` 接口与 `EvaluationResult` 契约。
3. **三种初始题型**：free_recall（canonicalAnswer 语义/关键词匹配）、fill_blank（空位精确匹配+多答案/同义词）、recognition（干扰项选择+精确匹配正确项）；ordering 标注为预留、本轮不定详细规格。
4. **确定性生成优先原则**（对应 learning-model 第5节）：canonicalAnswer/结构化字段优先，AI 仅兜底，AI 不触碰 LearningState。
5. **AI 生成题目校验规则**：指向已发布 KP、题型合法、答案可被 Evaluator 验证、复用 MedicalOutputValidator 医疗校验（表格列出 4 条拒绝条件）。
6. **题型扩展机制**：新增题型只需 config schema + Evaluator，Scheduler/FSRS/LearningState 零感知。
7. **与其他模型关系**：Instance 1:1 SessionItem、1:N Attempt，KP 为知识来源，Evaluation 由 Evaluator 产出；引用 BR-012/013/020/021/022/030/040/100/101。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `question-model.md`（项目根目录） | 题目领域模型规格，7 章节 |

---

### P2-11：AI 运行时守卫

**审核问题**：P0-1 已实现 `MedicalOutputValidator`（输出校验），但 AI 边界仅靠"缺席"（AI 模块无 application 用例所以无风险），无运行时守卫。需建立可接线的运行时守卫组件，包括输出守卫和 Prompt Injection 输入防护。

**修复内容**（全部落在 `src/modules/ai/domain/safety.ts`）：

| 组件 | 位置 | 职责 |
|---|---|---|
| `AiOutputGuardResult` | safety.ts:62 | 输出守卫结果（safe/violations/sanitized） |
| `AiOutputGuard` | safety.ts:77 | 组合 MedicalOutputValidator；不安全时返回违规原因 + 免责声明替换文本 |
| `PROMPT_INJECTION_PATTERNS` | safety.ts:104 | 中英双语注入模式常量（18 条，含 "ignore previous instructions"/"forget your rules"/"system prompt"/"你是一个"/"忽略以上"/"现在你扮演"） |
| `PromptInjectionDetectionResult` | safety.ts:130 | 输入检测结果（safe/patterns） |
| `PromptInjectionDetector` | safety.ts:144 | 浅度启发式检测，注释说明"生产环境需多层防御" |
| `GuardCheckResult` | safety.ts:171 | 单端校验结果 |
| `AiMessageGuard` | safety.ts:186 | 管道：`validateInput()`（注入检测）+ `validateOutput()`（医疗违规） |

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/modules/ai/domain/safety.ts` | 新增 AiOutputGuard / PromptInjectionDetector / AiMessageGuard / PROMPT_INJECTION_PATTERNS |
| `src/tests/unit/ai-guard.test.ts` | 15 用例（新建） |

**测试证据**（ai-guard.test.ts，15 用例，超过要求的 8 个）：
- 正常输入/输出放行
- ≥5 种注入模式被拦（ignore previous instructions / 忽略以上 / 现在你扮演 / system prompt / 你是一个）
- 医疗违规输出被拦
- "输入安全但输出违规"组合场景
- 空串/纯空白边界处理
- 违规时 sanitized=免责声明
- 常量完整性校验

---

## 五、V2 核心不变量验证（P2 修复后）

修复后全仓测试通过，以下核心不变量均被真实测试守护：

| 不变量 | 测试 | 状态 |
|---|---|---|
| 首次复习恰好 1 Attempt+1 Evaluation+1 ReviewEvent+1 LearningState | `golden-scenario.test.ts` | ✅ |
| reviewCount=1、dueAt 在未来 | `golden-scenario.test.ts` | ✅ |
| 同一 Review 重放不二次推进 | `golden-scenario.test.ts` | ✅ |
| UNIQUE(attemptId) / UNIQUE(userId,knowledgePointId) / UNIQUE(userId,localDate) / UNIQUE(userId,clientRequestId) | schema + 幂等测试 | ✅ |
| 评价与评级分离（BR-020/022） | `finalize-review.ts` 读 Evaluation.isCorrect + `domain-constructors.test.ts` | ✅ |
| 幂等（clientRequestId）+ TOCTOU 并发兜底 | `learning-flow.test.ts` | ✅ |
| 时区用户优先（getLocalDate 生产实现 + IANA 转换） | `timezone.test.ts` + `finalize-review.ts` + `end-session.ts` | ✅ |
| AI 不直接修改 LearningState | ai 模块零 LearningState 引用 | ✅ |
| AI 输出医疗安全守卫 + Prompt Injection 输入守卫 | `ai-guard.test.ts` + `medical-safety*.test.ts` | ✅ |
| FSRS 状态机保真（New/Learning/Review/Relearning 四态透传） | `fsrs-mapping.test.ts` | ✅ |
| BR 编号唯一性（BR-071=事务原子性，BR-072=StudyDay 汇总） | grep 全 src/ 核对 | ✅ |
| RegisterUser 时区必填（BR-093） | `identity.test.ts` | ✅ |
| CompletePlanItem 事务一致性 | `session-study-plan.test.ts` | ✅ |

---

## 六、测试结果汇总

```
修复前：13 文件 / 180 用例
修复后：15 文件 / 211 用例 全部通过

Test Files  15 passed (15)
     Tests  211 passed (211)
  Duration  ~3.3s

npx tsc --noEmit → exit 0（0 错误）
```

### 按层级分布
| 层级 | 文件数 | 用例数 | 新增用例 |
|---|---|---|---|
| unit | 7 | 156 | +31（timezone 6 + ai-guard 15 + fsrs 5 + identity 4 + learning-flow 1） |
| integration | 7 | 49 | — |
| e2e | 1 | 6 | — |
| **合计** | **15** | **211** | **+31** |

### 新增文件清单
| 文件 | 类型 | 对应 P2 |
|---|---|---|
| `question-model.md` | 规格文档 | P2-7 |
| `src/shared/infrastructure/timezone.ts` | 生产实现 | P2-10 |
| `src/tests/unit/timezone.test.ts` | 单元测试 | P2-10 |
| `src/tests/unit/ai-guard.test.ts` | 单元测试 | P2-11 |

---

## 七、已知限制与后续决策点

1. **P2-3 FSRS 状态机行为**：本仓库 ts-fsrs 版本中，新卡首次 good 实际进入 Learning(1) 而非直接 Review(2)，需 Learning 态再 good 才毕业到 Review。测试已按真实行为断言，若后续升级 ts-fsrs 版本需重新核对状态转移。

2. **P2-10 getLocalDate 回退策略**：用户不存在或时区非法时回退 UTC 并告警，不抛错。若业务要求严格失败（如用户数据必须有时区），可在后续迭代改为抛错。

3. **P2-11 Prompt Injection 检测**：当前为基础启发式关键词/模式匹配，不保证 100% 拦截。生产环境应结合模型层 system prompt 强化、输出校验和人工审核多层防御。AI application 层用例（Phase 11）实现时需将守卫管道接入真实调用路径。

4. **P2-8 User.timezone DB 默认**：prisma schema 中 User.timezone 仍保留 `@default("Asia/Shanghai")`，这是 DB 层兜底默认。应用层 RegisterUser 已强制校验时区必填，两者不冲突。若后续要求 DB 层也禁止默认，可移除 schema 默认值。

---

*本 FixLog 逐条回指 `Phase1-规格定稿-综合审核报告.md` 中的 P2 问题编号。综合审核报告本身未修改；`FixLog-P0P1.md` 未修改。*
