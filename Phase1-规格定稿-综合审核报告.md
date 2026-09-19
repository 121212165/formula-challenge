# 审核报告：Phase 1 — Specification 规格定稿（综合审核）

> 审核日期：2026-09-18
> 审核范围：formula-challenge V2 三份规格（domain-model / business-rules / learning-model）+ 交叉一致性 + question-model 缺失影响
> 审核方法：四份规格文档（domain-model.md / business-rules.md / learning-model.md / question-model.md）在本地文件系统中**均不存在**，本次审核从 `formula-challenge-v2/src` 代码与 `prisma/schema.prisma` 反向提取规格后逐项核验
> 审核原则：只看不改，未修改任何项目文件
> 子代理分工：domain-model 审核 / business-rules 审核 / learning-model 审核（含实跑测试）/ 交叉一致性核对

---

## 结论

**有条件通过。**

核心架构决策在代码中落地一致且被真实测试守护：8 个限界上下文划分清晰、Domain 层零 Prisma/零 Next.js 依赖、系统评价与记忆评级分离干净、Scheduler 自有接口 + FSRS 适配器隔离、黄金场景 33 个用例实跑全部通过、幂等与三种"完成"语义不混用均有真实验证。

但存在 **3 个 P0 阻断项**与 **11 个 P1 严重项**，集中在：医疗安全边界零实现、ContentItem/StudyPlan 状态机缺失、三模块 Repository 接口缺失、事务无真实实现、题目链路断口、StudyDay 统计语义错误。需在进入 Phase 2（Domain）前补齐声明与接口，否则下游用例无规格可依。

---

## 一、Phase 1 验收标准核对表（六项焦点）

| # | 验收标准 | 结论 | 证据 |
|---|---------|------|------|
| 1 | 四份规格文档覆盖 V2 全部核心对象（八域） | ⚠️ 部分满足 | 三份规格文档文件不存在；代码中八域目录齐全（`src/modules/` 下 identity/content/knowledge/question/learning/study-plan/ai/governance），但 Content/AI/Governance 三域仅有 domain 类型定义，无 application 用例；question-model.md 缺失导致题型规格缺口 |
| 2 | 10 条 Hard invariants 全部被显式声明 | ⚠️ 部分满足 | UNIQUE 约束/幂等/密码哈希/Evaluator 零状态修改已落地；**医疗安全边界（H10）零声明零实现**；时区（H7）仅注入接口无真实转换实现；事务（H4）为契约级 no-op |
| 3 | 状态机（ContentItem/StudySession/StudyPlan/Attempt）合法/禁止迁移定义完整 | ❌ 不满足 | Attempt/StudySession 有守卫函数但**死代码零调用**；**ContentItem 无任何迁移函数、无发布流用例**；**StudyPlan 生成即 active 跳过 draft，无 completed/expired 迁移**；SessionItem 允许 pending 直跳 completed |
| 4 | 领域边界清晰（Auth/学习分离、AI/权威数据分离、Scheduler/UI 分离） | ✅ 满足 | User 仅含身份字段，学习属性外置 UserLearningProfile；AI 模块零 LearningState 引用；Scheduler 接口在 domain 层，FSRS 在 infrastructure 适配器；Domain 层零 Prisma/零 Next.js |
| 5 | 无自相矛盾或未定义术语（"完成"三语义区分） | ⚠️ 部分满足 | Attempt/Review/PlanItem 三种"完成"在代码中明确分离且有测试验证；但 **StudyDay.correctCount 用 ReviewRating 反推正确率，违反评价/评级分离**；StudyDay.attemptCount 名实不符（实际统计复习次数）；BR-071 编号重载 |
| 6 | 28 个 Prisma 模型全部有归属 | ✅ 满足（含差异） | 实际 schema 有 **29 个模型**（多出 Meridian，归属 Content 域），全部在 domain 层有对应定义；差异已标注 |

---

## 二、10 条 Hard invariants 逐项核验

| # | 硬不变量 | 结论 | 证据 |
|---|---------|------|------|
| H1 | DB 层 UNIQUE 约束兜底关键聚合唯一性 | ✅ | `schema.prisma:457` `@@unique([userId, clientRequestId])`；`:465` Evaluation.attemptId @unique；`:479` ReviewEvent.attemptId @unique（BR-030）；`:514` `@@unique([userId, knowledgePointId])`（BR-040）；`:532` StudyDay（BR-070）；`:549` StudyPlan（BR-060）等 20+ 处 |
| H2 | Attempt 幂等：clientRequestId 不产生二次副作用 | ✅ | `submit-attempt.ts:60-63` 命中即返回既有 Attempt；测试 `learning-flow.test.ts:143-177` 验证第二次返回同一 id |
| H3 | 一个 Attempt 最多一个 ReviewEvent（BR-030） | ✅ | `finalize-review.ts:97-111` 幂等短路；DB `schema.prisma:479` 兜底；黄金测试 `golden-scenario.test.ts:142-153` 验证 |
| H4 | ReviewEvent + LearningState 同事务（BR-033） | ⚠️ 契约级 | `finalize-review.ts:90` 包在 `uow.transaction` 内，但 UoW 唯一实现是测试 no-op（`return fn()`），全仓无 `prisma.$transaction` |
| H5 | LearningState 唯一 (userId, kpId)，显式初始化（BR-040/042） | ✅ | `schema.prisma:514`；`finalize-review.ts:122-129` 不存在时初始化，无 null 散落（但 `createInitialLearningStateDraft` 是死代码，实际走 `scheduler.initialize`） |
| H6 | Evaluator 零 LearningState 修改（BR-022） | ✅ | `evaluator.ts:43-72` 纯函数，无 repo 依赖；`evaluation.ts:3` 注释声明 |
| H7 | 时区：所有"今天/StudyDay/计划"按 User.timezone 计算 | ⚠️ 契约级 | `finalize-review.ts:37` 注入 `getLocalDate`，但全仓无时区转换实现；测试写死 `"2026-09-17"`；`register-user.ts:54,77` 对缺时区默认 `Asia/Shanghai` 而非拒绝（违反 BR-093） |
| H8 | 密码只存哈希，令牌只存 tokenHash（BR-092） | ✅ | `register-user.ts:71` `hasher.hash`；`:96` sha256 tokenHash；测试 `identity.test.ts:51-52` 验证存储值≠明文 |
| H9 | AI 不写 LearningState / canonical（BR-100/101） | ⚠️ 仅靠缺席 | `src/modules/ai/` 无 application 层，边界成立是因为 AI 模块尚未实现，而非被守卫；无 Output Validation / Safety Filter |
| H10 | 医疗安全边界：无诊断/处方/替代医生行为 | ❌ **缺失** | 全仓库 grep 不到"医疗""诊断""处方""safety""disclaimer"任何字样；AI 无输出安全过滤器 |

---

## 三、问题清单（按严重度排序，已去重合并）

### P0 — 阻断（必须修复后才能进入下一阶段）

| # | 模块 | 问题 | 证据 | 违反条款 |
|---|------|------|------|---------|
| P0-1 | governance / ai | **医疗安全边界零声明零实现**：无诊断/处方/替代医生禁止项，AI 无输出安全过滤器 | 全仓库无相关字样；`src/modules/ai/` 无 application/safety 层 | 全局硬性检查项第 10 条；BR 第 12 节；Phase 11 第 4 条 |
| P0-2 | content | **ContentItem 状态机完全缺失**：无 `canTransitionContent`、无 Publish/Review/Archive 用例，draft→published 直通无防护 | `content.ts:25-42` 仅枚举+`isContentVisible`；`src/modules/content/` 无 application 目录 | Phase 1 焦点 3；Phase 12 第 2 条 |
| P0-3 | study-plan | **StudyPlan 状态机缺失**：新建 plan 直接 `status:"active"` 跳过 draft；无 completed/expired 迁移；无 `canTransitionPlan` | `generate-study-plan.ts:86`；`study-plan.ts:7` 全文无迁移函数 | Phase 1 焦点 3；Phase 9 第 7 条 |

### P1 — 严重（应在进入下一阶段前修复）

| # | 模块 | 问题 | 证据 | 违反条款 |
|---|------|------|------|---------|
| P1-1 | content / ai / governance | **三模块缺 Repository 接口**：ContentItem/ContentSource/ContentVersion/AiConversation/AiMessage/ContentIssue 共 6 个聚合根无仓库接口 | `src/modules/content/domain/`、`ai/domain/`、`governance/domain/` 下无 repositories.ts | Phase 1 焦点 1/3 |
| P1-2 | shared/domain | **状态机守卫函数死代码**：`canTransitionAttempt`（`attempt.ts:24-27`）、`canTransitionSession`（`session.ts:31-35`）定义后零调用，守卫全部内联在用例层，领域层未强制状态机 | grep 仅命中定义处；对比 `evaluate-attempt.ts:74`、`end-session.ts:38` 内联判断 | Phase 2 焦点 2 |
| P1-3 | shared/errors | **三个错误类死代码**：`ForbiddenError`、`DuplicateRequestError`、`ContentNotPublishedError` 全仓库零 import；未发布知识点误用 `NotFoundError`（404 语义应为 403） | `errors/index.ts:21-26,56-68`；`submit-attempt.ts:90`、`evaluate-attempt.ts:82` | Phase 2 焦点 6 |
| P1-4 | infrastructure | **无真实事务实现**：`UnitOfWork` 唯一实现是测试 no-op（`return fn()`），全仓无 `prisma.$transaction`、无 Prisma Repository 类；DB 级 UNIQUE 约束与事务回滚均未被集成验证 | `golden-scenario.test.ts:28-31`；`src/modules/*/infrastructure/` 仅 2 个文件 | BR-033；Phase 3 焦点 5 |
| P1-5 | governance / content | **BR-080/081/082 仅注释声明**：ContentSource/ContentVersion 表存在但无导入校验用例、无版本写用例、无 CreateIssue 审核任务用例 | `source-version.ts:2`、`content-issue.ts:4`；`src/modules/governance/` 无 application | Phase 4 焦点 4-5；Phase 12 焦点 1/3/4 |
| P1-6 | identity | **VerifyEmail / ResetPassword 两次连续 save 未包事务**，中途失败会半成功（token 已 usedAt 但 user.emailVerifiedAt 未写） | `verify-email.ts:47-48`；`reset-password.ts:50-56` | 事务原子性精神 |
| P1-7 | learning | **StudyDay.completedSessionCount 永远为 0**：`CompleteSession` 不更新 StudyDay，`finalize-review.ts:187` 保留旧值 | `end-session.ts:33-53`；`finalize-review.ts:187` | BR-070/071 StudyDay 语义 |
| P1-8 | tests | **无 unit 测试目录**：`src/tests/unit/` 不存在（package.json 指向它），domain 纯函数（状态机、构造器、FSRS 映射）无单元测试，TDD 契约条目无落点 | Glob `src/tests/unit/**` = 0 | learning-model §21 TDD 契约 |
| P1-9 | learning / question | **题目链路断口**：`GenerateQuestion` 建实例后不回写 `SessionItem.questionInstanceId`（`generate-question.ts:64-73`），而 `SubmitAttempt` 依赖它查题（`submit-attempt.ts:83`），端到端只能靠测试手工补字段打通 | `generate-question.ts:64-73`；`submit-attempt.ts:83`；`learning-flow.test.ts:335-338` | domain-model 关系一致性；Phase 6 焦点 3 |
| P1-10 | learning | **StudyDay.correctCount 用 ReviewRating 反推正确率**：`finalize-review.ts:184` `correctCount + (rating === "again" ? 0 : 1)`，未读 `Evaluation.isCorrect`，答错但选 good 会被误计为正确，直接违反评价/评级分离 | `finalize-review.ts:184`；对照 `evaluation.ts:11` | BR-022；全局硬约束 |
| P1-11 | schema / identity | **Credential 实体无 schema 对应**：domain 定义了 `Credential`（`user.ts:18-23`）与 `CredentialRepository`，register-user 真实写入，但 prisma schema 无 Credential 模型、User 无 passwordHash 字段 | `user.ts:18`；`repositories.ts:25`；`register-user.ts:104`；`schema.prisma:126-148` | Phase 1 焦点 1；schema-domain 一致 |

### P2 — 一般（可随开发任务修复）

| # | 模块 | 问题 | 证据 | 违反条款 |
|---|------|------|------|---------|
| P2-1 | learning/domain | `createInitialLearningStateDraft` 死代码，BR-042 注释引用的函数名 `createInitialLearningState` 不存在；首次初始化实际走 `scheduler.initialize` | `learning-state.ts:26,39`；`finalize-review.ts:129` | BR-042；Phase 2 焦点 4 |
| P2-2 | learning/application | 幂等存在 TOCTOU：`findByClientRequestId` 与 `save` 之间无并发保护，生产层只能靠 DB UNIQUE 兜底 | `submit-attempt.ts:60-109` | BR-012 |
| P2-3 | learning/infrastructure | `draftToCard` 用 `reviewCount===0 \|\| stability===0` 判空卡，还原时硬编码 `State.Review`，FSRS 首次 again 后本应为 Learning 态，存在状态机还原失真 | `fsrs-scheduler.ts:24-39` | learning-model §10 FSRS 保真 |
| P2-4 | learning | SessionItem 允许 pending 直跳 completed，跳过 active，无 `canTransitionSessionItem` | `finalize-review.ts:171-172`；`session.ts:20` | Phase 8 焦点 5 |
| P2-5 | study-plan | StudyPlan 的 draft/expired/completed 状态永不可达，生成即 active | `study-plan.ts:7`；`generate-study-plan.ts:86` | Phase 9 焦点 7 |
| P2-6 | shared | **BR-071 编号重载**：同时被用作 StudyDay 汇总 和 注册事务原子性 两个不变量 | `study-day.ts:2`；`register-user.ts:2`；`golden-scenario.test.ts:177`；`identity.test.ts:38` | business-rules 编号唯一性 |
| P2-7 | question | **question-model 缺失导致题型规格缺口**：QuestionType 多出 `ordering` 且无处理分支；Evaluator 不按题型分支（仅归一化字符串匹配）；QuestionInstance 不存题目 payload；BR-021"三科目各自 Evaluator"仅注释 | `question.ts:8`；`evaluator.ts:43-72`；`evaluate-attempt.ts:90` 静默退 free_recall | Phase 6 焦点 1/4；BR-021 |
| P2-8 | identity | RegisterUser 对缺时区默认 `Asia/Shanghai` 而非拒绝，违反 BR-093"时区必填" | `register-user.ts:54,77`；`user.ts:10` | BR-093；Phase 5 焦点 6 |
| P2-9 | study-plan | CompletePlanItem 未注入 UnitOfWork，与其他写用例风格不一致 | `today-plan.ts:10-12,41-54` | 事务一致性 |
| P2-10 | learning / shared | 时区转换无实现：`getLocalDate` 是注入接口，全仓无 IANA tz 转换代码，跨午夜/夏令时零覆盖 | `finalize-review.ts:37,176`；`golden-scenario.test.ts:106` | BR-061/093 |
| P2-11 | ai | BR-100/101 仅靠"AI 模块未实现"维持边界，无运行时守卫、无 Output Validation、无 Prompt Injection 防护 | `conversation.ts:2-4`；`src/modules/ai/` 无 application | Phase 11 焦点 1/2/5/6 |
| P2-12 | content / ai / governance | 三模块无 application 层用例，仅有 domain 类型定义 | `src/modules/content/application/`、`ai/application/`、`governance/application/` 为空 | Phase 1 焦点 1 |

### P3 — 建议（不阻塞）

| # | 模块 | 问题 | 证据 |
|---|------|------|------|
| P3-1 | 全局 | 三份规格文档（domain-model.md / business-rules.md / learning-model.md）不存在，本次为代码反向提取审核 | 全文件系统搜索 0 命中 |
| P3-2 | learning | StudyDay.attemptCount 名实不符，实际统计复习次数（FinalizeReview 内 +1），SubmitAttempt 不累计 | `finalize-review.ts:183`；`study-day.ts:13` |
| P3-3 | question | BR-021"三科目各自 Evaluator"仅注释承诺，代码只有一个通用 CanonicalMatchEvaluator | `evaluator.ts:2-3,33` |
| P3-4 | study-plan | StudyPlanSource 定义 ai/manual，但 GenerateStudyPlan 恒写 scheduler，无 AI/manual 入口 | `study-plan.ts:6`；`generate-study-plan.ts:85` |
| P3-5 | learning | 重放时若新 rating 与已存 ReviewEvent.rating 不同，代码静默返回旧评级，不提示不一致 | `finalize-review.ts:97-111` |
| P3-6 | architecture | 领域对象为贫血接口（Attempt/LearningState 无行为方法），不变量全在应用层 | `attempt.ts:8-22`、`learning-state.ts:8-22` |
| P3-7 | learning | ReviewEvent.previousState/nextState 用 Json 列，符合"不可查询快照允许 JSON"纪律，但无类型校验 | `schema.prisma:484-485` |
| P3-8 | app | app/ 目录无实际页面文件，仅有空目录骨架 | `src/app/` 下 admin/(app)/(auth) 为空 |

### 假测试（单独标注）

| # | 测试文件 | 问题 | 证据 |
|---|---------|------|------|
| F-1 | `session-study-plan.test.ts:280-304` | "FinalizeReview 后 StudyPlan 不受影响"用例中 `void review`（:300）**根本没调用** `review.execute()`，却声称验证 Review 不影响计划——假测试 | `session-study-plan.test.ts:300` |

---

## 四、测试有效性评价

**实跑结果**（learning-model 子代理执行 `npm test`）：vitest 4.1.11，5 个测试文件 / 33 个用例**全部通过**。

**真实验证业务规则的测试：**
- `golden-scenario.test.ts`（6 用例）：首次 Review 1+1+1+1、reviewCount=1、dueAt 在未来、重放不二次推进、非法状态拒绝——断言真实
- `learning-flow.test.ts`（8 用例）：clientRequestId 幂等、Session completed 拒绝提交、已评价不重复评价——真断言
- `session-study-plan.test.ts`（9 用例）：同日 plan 不重复、CompletePlanItem 不改 LearningState（reviewCount===3 不变）、Session 状态机禁止迁移——真断言
- `identity.test.ts`：注册四表同写、tokenHash≠明文、防用户枚举（错误密码与幽灵邮箱统一 UnauthorizedError）——真断言
- `question-engine.test.ts`：题目生成与评价链路

**薄弱/未覆盖：**
- 所有事务跑 no-op UoW，**无任何用例模拟"写 ReviewEvent 后 LearningState 失败"验证回滚**——BR-033 零覆盖
- 无并发/重试竞争测试；跨午夜时区零覆盖
- `session-study-plan.test.ts:280-304` 为假测试（见 F-1）
- schema 的 UNIQUE 约束目前是"纸面上的约束"，未在真实 PostgreSQL 上执行过

---

## 五、交叉一致性核对摘要

| 维度 | 结论 | 说明 |
|------|------|------|
| Scheduler 接口三层签名 | ✅ 完全一致 | `scheduler.ts:11-18` ↔ `fsrs-scheduler.ts:44,58` ↔ `finalize-review.ts:129,132`，方法名/参数/返回值无偏差 |
| Attempt 状态机 enum/type | ✅ 一致 | prisma enum = TS 联合类型 = application 层使用，三态对齐 |
| BR-030/040/060/070 唯一约束 | ✅ 双侧一致 | schema 与 domain 注释/代码均体现 |
| 术语"完成"四语义 | ⚠️ 基本区分 | Attempt/Review/PlanItem/SessionItem 类型层分离，但 StudyDay 统计字段名实不符 |
| 实体关系 schema vs domain | ❌ 2 处缺口 | SessionItem 双指针不回写（P1-9）；Credential 无 schema 对应（P1-11） |
| BR 编号一致性 | ❌ 2 处问题 | BR-071 重载（P2-6）；BR-042 注释错名（P2-1） |
| 状态机跨层一致性 | ⚠️ | enum 一致，但 domain 守卫死代码，SessionItem/StudyPlan 迁移失控 |

---

## 六、question-model.md 缺失影响评估

**已落地、不受缺失影响：**
- QuestionTemplate / QuestionInstance 数据结构在 domain 与 schema 双侧一致
- `@@unique([knowledgePointType, type])` 约束存在
- GenerateQuestion 用例可按类型找模板并生成实例

**因缺失独立规格而悬空：**
1. **题型枚举不一致**：QuestionType 含 4 值（free_recall/fill_blank/recognition/ordering），Phase 6 只要求 3 种，`ordering` 多出且零处理
2. **评分契约缺失**：Evaluator 仅归一化字符串匹配，不按题型分支；fill_blank 挖空判定、recognition 选项判定、ordering 顺序判定均未实现
3. **题目 payload 缺失**：QuestionInstance 不存渲染后的题干/选项，template.config 是无 schema 的 `Json?`
4. **题型-知识点绑定矩阵缺失**：哪些 kp.type 允许哪些题型、缺模板时降级策略无规格（`evaluate-attempt.ts:90` 静默退 free_recall）

**结论**：缺失 question-model.md 不影响已实现的 free_recall 主链路，但使"题型扩展无需改学习引擎"的承诺无法验收。建议 Phase 6 启动前补 question-model.md，至少钉死：题型枚举（去掉或正式纳入 ordering）、payload schema、分题型评分规则。

---

## 七、未覆盖风险与进入 Phase 2 前提示

1. **规格文档本身缺失**：本次审核完全基于代码反向提取，可能遗漏规格中定义但尚未实现的约束。建议在 Phase 2 前正式产出三份规格文档，或明确"代码即规格"模式并补全文档注释。
2. **真实数据库一侧为零**：schema 声明了全部关键 UNIQUE，但无 migration、无 Prisma 仓储、无 `db:push` 验证记录。Phase 3 必须用真实 PostgreSQL 重跑黄金测试，验证约束与事务回滚。
3. **时区黑盒**：`getLocalDate` 是注入接口但无生产实现；跨午夜、用户改时区、夏令时均无行为定义。BR-061/093 的"业务层零 server timezone"目前未被代码验证。
4. **AI 边界仅靠缺席**：BR-100/101/102 在 `src/modules/ai/` 一旦开始实现就会立刻裸露，需先定 Output Validation 与 Safety Filter 契约再写 AI 用例。
5. **贫血领域实体**：所有 domain 文件是 interface + 零散死函数；Phase 2 验收"Attempt 状态机在领域层强制"目前不成立，需重构为实体方法或删掉死函数。
6. **FSRS 数值正确性**：`FsrsScheduler.review` 未对多次复习后的 stability/difficulty 区间做快照断言，dueAt 是否符合 FSRS 预期仅靠"在未来"弱断言。
7. **Content→KnowledgePoint 生成链路**：Content 域仅有实体定义，无 importer/用例，闭环最上游（内容进 canonical）尚未打通。
8. **并发/竞态未覆盖**：UNIQUE 约束兜底的幂等在内存仓库中无并发场景测试，网络重试/并发提交下真实行为未知。

---

## 八、通过条件（转为"通过"需满足）

### 必须修复（P0 + P1 核心）

1. **医疗安全边界**：在 `src/modules/ai/` 或 `src/shared/` 增加医疗安全禁止项声明（diagnosis/prescription/safetyFilter 契约），哪怕是空接口也要声明
2. **ContentItem 状态机**：在 `content.ts` 增加 `canTransitionContent`，明确 draft→review→published→archived 合法路径，禁止 draft→published 直通
3. **StudyPlan 状态机**：在 `study-plan.ts` 增加 `canTransitionPlan`，`generate-study-plan.ts:86` 改为先建 draft 再显式迁移到 active
4. **三模块 Repository 接口**：为 ContentItem/ContentSource/ContentVersion/AiConversation/AiMessage/ContentIssue 补仓库接口定义
5. **题目链路断口**：`GenerateQuestion` 创建实例后回写 `SessionItem.questionInstanceId`，或明确由其他用例负责绑定
6. **StudyDay.correctCount**：改为读取 `Evaluation.isCorrect`，而非用 ReviewRating 反推
7. **Credential 持久化**：prisma schema 增加 Credential 模型或在 User 中增加 passwordHash，使 domain 关系有落点
8. **死代码清理**：删除或接通 `canTransitionAttempt`/`canTransitionSession`/`createInitialLearningStateDraft` 三个死函数
9. **假测试修复**：`session-study-plan.test.ts:280-304` 实际调用 `review.execute()` 后再断言

### 应在 Phase 2/3 前补齐

10. 建立 `src/tests/unit/`，覆盖状态机、构造器、FSRS 映射的单元测试
11. `VerifyEmail`/`ResetPassword` 两次写包进 `uow.transaction`
12. `CompleteSession` 成功后 upsert `StudyDay.completedSessionCount`
13. 三个死错误类删除或接通，未发布知识点改用 `ContentNotPublishedError`
14. BR-071 编号拆分，明确各自语义
15. 时区：缺时区拒绝创建而非默认；补 IANA tz 转换实现

---

*本综合报告由四份子代理审核报告（domain-model / business-rules / learning-model / 交叉一致性）整合去重而成。所有证据均为审核时快照的文件:行号。全程只读，未修改任何代码或文档。*
