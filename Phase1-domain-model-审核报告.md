# 审核报告：Phase 1 — Domain-Model 规格反向提取审核

> 审核日期：2026-09-17
> 审核范围：formula-challenge-v2 项目 domain-model 维度
> 审核方法：从代码实现反向提取领域模型规格，按 Phase 1 验收标准逐项核验
> 说明：domain-model.md / business-rules.md / learning-model.md 三份规格文档在本地文件系统中不存在，本报告基于代码实现反向提取规格后进行审核。

---

## 结论

**有条件通过**

理由：8 个限界上下文目录结构清晰，Domain 层零 Prisma/零 Next.js 依赖，Auth 与学习分离、Scheduler 接口隔离、AI 不直接写 LearningState 等核心架构边界均已在代码中体现。但存在 **3 个 P1 级缺失**：Content / AI / Governance 三个模块无 Repository 接口定义，且 Content 聚合根（ContentItem）缺少对应 Repository。需补齐后方可视为规格定稿完整。

---

## 验收标准核对表

| # | 验收标准 | 结论 | 证据（文件:行） |
|---|---------|------|----------------|
| 1 | 8 个限界上下文在 src/modules/ 下清晰划分 | ✅ 满足 | `src/modules/` 下存在 8 个目录：`identity/` `content/` `knowledge/` `question/` `learning/` `study-plan/` `ai/` `governance/`，每个目录均包含 `domain/` 子目录 |
| 2 | 实体关系与聚合根（User/ContentItem/KnowledgePoint/StudySession/StudyPlan/Attempt）完整 | ⚠️ 部分满足 | 6 个聚合根实体均有 domain 定义（见下表），但 ContentItem 缺少对应 Repository 接口 |
| 3 | 领域服务与 Repository 接口覆盖全部聚合根 | ❌ 不满足 | 14 个 Repository 接口中缺少 ContentItemRepository / ContentSourceRepository / ContentVersionRepository / AiConversationRepository / AiMessageRepository / ContentIssueRepository 共 6 个 |
| 4 | Domain 层零 Prisma / 零 Next.js 依赖 | ✅ 满足 | 对 `src/modules/` 全目录搜索 `@prisma/client` 和 `next/` import，命中 0 条 |
| 5 | React 页面不直接 import Prisma | ✅ 满足 | 对 `src/app/` 全目录搜索 `@prisma/client` 和 `prisma`，命中 0 条（注：app/ 目录下目前仅有空目录骨架，无实际页面文件） |
| 6 | 29 个 Prisma 模型全部归入 8 域，无模型无归属 | ✅ 满足 | 29 个模型均在对应域的 domain 层有 interface 定义（见下方模型归属表） |
| 7 | Auth（identity）不含学习字段（dailyGoal/streak/mastery） | ✅ 满足 | `src/modules/identity/domain/user.ts:6-16` — User interface 仅含 id/email/name/timezone/emailVerifiedAt/createdAt/updatedAt，无任何学习状态字段；学习属性外置至 UserLearningProfile（`user.ts:45-52`） |
| 8 | AI 模块不直接写 LearningState / canonical content | ✅ 满足 | `src/modules/ai/domain/conversation.ts` 仅定义 AiConversation / AiMessage 两个只读实体；全 ai/ 目录搜索 `LearningState` 命中 0 条；无 application 层写操作 |
| 9 | Scheduler 在 domain 层定义接口，FSRS 被适配器隔离 | ✅ 满足 | 接口定义：`src/modules/learning/domain/scheduler.ts:11-18`；FSRS 适配器：`src/modules/learning/infrastructure/fsrs-scheduler.ts:41`（implements Scheduler）；domain 层不 import ts-fsrs |

---

## 聚合根实体与 Repository 对照表

| 聚合根 | Domain 实体文件 | Repository 接口 | 接口文件 | 状态 |
|--------|----------------|----------------|----------|------|
| User | `identity/domain/user.ts:6` | UserRepository | `identity/domain/repositories.ts:14` | ✅ |
| ContentItem | `content/domain/content.ts:27` | **缺失** | — | ❌ |
| KnowledgePoint | `knowledge/domain/knowledge-point.ts:10` | KnowledgePointRepository | `knowledge/domain/knowledge-point-repository.ts:7` | ✅ |
| StudySession | `learning/domain/session.ts:9` | StudySessionRepository | `learning/domain/repositories.ts:36` | ✅ |
| StudyPlan | `study-plan/domain/study-plan.ts:11` | StudyPlanRepository | `study-plan/domain/study-plan-repository.ts:7` | ✅ |
| Attempt | `learning/domain/attempt.ts:8` | AttemptRepository | `learning/domain/repositories.ts:13` | ✅ |

---

## 29 个 Prisma 模型归属表

| # | 模型名 | 归属域 | Domain 定义文件 | 状态 |
|---|--------|--------|----------------|------|
| 1 | User | Identity | `identity/domain/user.ts:6` | ✅ |
| 2 | UserLearningProfile | Identity | `identity/domain/user.ts:45` | ✅ |
| 3 | UserSubjectPreference | Identity | `identity/domain/user.ts:54` | ✅ |
| 4 | EmailVerificationToken | Identity | `identity/domain/user.ts:25` | ✅ |
| 5 | PasswordResetToken | Identity | `identity/domain/user.ts:34` | ✅ |
| 6 | Subject | Content | `content/domain/content.ts:8` | ✅ |
| 7 | SubjectCategory | Content | `content/domain/content.ts:17` | ✅ |
| 8 | ContentItem | Content | `content/domain/content.ts:27` | ✅ |
| 9 | FormulaContent | Content | `content/domain/professional-content.ts:6` | ✅ |
| 10 | HerbContent | Content | `content/domain/professional-content.ts:15` | ✅ |
| 11 | Meridian | Content | `content/domain/professional-content.ts:25` | ✅ |
| 12 | AcupointContent | Content | `content/domain/professional-content.ts:33` | ✅ |
| 13 | ContentSource | Content | `content/domain/source-version.ts:5` | ✅ |
| 14 | ContentVersion | Content | `content/domain/source-version.ts:15` | ✅ |
| 15 | KnowledgePoint | Knowledge | `knowledge/domain/knowledge-point.ts:10` | ✅ |
| 16 | QuestionTemplate | Question | `question/domain/question.ts:10` | ✅ |
| 17 | QuestionInstance | Question | `question/domain/question.ts:20` | ✅ |
| 18 | StudySession | Learning | `learning/domain/session.ts:9` | ✅ |
| 19 | SessionItem | Learning | `learning/domain/session.ts:22` | ✅ |
| 20 | Attempt | Learning | `learning/domain/attempt.ts:8` | ✅ |
| 21 | Evaluation | Learning | `learning/domain/evaluation.ts:6` | ✅ |
| 22 | ReviewEvent | Learning | `learning/domain/review-event.ts:20` | ✅ |
| 23 | LearningState | Learning | `learning/domain/learning-state.ts:8` | ✅ |
| 24 | StudyDay | Learning | `learning/domain/study-day.ts:7` | ✅ |
| 25 | StudyPlan | Study Plan | `study-plan/domain/study-plan.ts:11` | ✅ |
| 26 | StudyPlanItem | Study Plan | `study-plan/domain/study-plan.ts:20` | ✅ |
| 27 | AiConversation | AI | `ai/domain/conversation.ts:6` | ✅ |
| 28 | AiMessage | AI | `ai/domain/conversation.ts:17` | ✅ |
| 29 | ContentIssue | Governance | `governance/domain/content-issue.ts:10` | ✅ |

> 注：规格文档预期为 28 个模型，实际 schema.prisma 为 29 个（多出 Meridian 模型，`prisma/schema.prisma:281-290`）。Meridian 归属 Content 域，已在 `content/domain/professional-content.ts:25-31` 定义。差异已标注。

---

## Repository 接口清单（实际提取）

| # | 接口名 | 所属模块 | 文件位置 |
|---|--------|---------|---------|
| 1 | UserRepository | Identity | `identity/domain/repositories.ts:14` |
| 2 | UserProfileRepository | Identity | `identity/domain/repositories.ts:20` |
| 3 | CredentialRepository | Identity | `identity/domain/repositories.ts:25` |
| 4 | AuthTokenRepository | Identity | `identity/domain/repositories.ts:30` |
| 5 | KnowledgePointRepository | Knowledge | `knowledge/domain/knowledge-point-repository.ts:7` |
| 6 | QuestionRepository | Question | `question/domain/question-repository.ts:7` |
| 7 | AttemptRepository | Learning | `learning/domain/repositories.ts:13` |
| 8 | EvaluationRepository | Learning | `learning/domain/repositories.ts:20` |
| 9 | ReviewEventRepository | Learning | `learning/domain/repositories.ts:25` |
| 10 | LearningStateRepository | Learning | `learning/domain/repositories.ts:30` |
| 11 | StudySessionRepository | Learning | `learning/domain/repositories.ts:36` |
| 12 | SessionItemRepository | Learning | `learning/domain/repositories.ts:41` |
| 13 | StudyDayRepository | Learning | `learning/domain/repositories.ts:47` |
| 14 | StudyPlanRepository | Study Plan | `study-plan/domain/study-plan-repository.ts:7` |

**合计：14 个 Repository 接口**（预期规格为 10 个，实际多出 4 个，差异在于 Learning 域拆分较细）。

---

## 问题清单

| 严重度 | 模块 | 问题描述 | 证据 | 违反条款 |
|--------|------|---------|------|---------|
| P1 | Content | ContentItem 聚合根无对应 Repository 接口 | `src/modules/content/domain/` 下无 `repositories.ts` 文件；全 content/ 目录搜索 "Repository" 命中 0 条 | Phase 1 验收标准第 3 条：Repository 接口应覆盖全部聚合根 |
| P1 | Content | ContentSource / ContentVersion 无 Repository 接口 | `src/modules/content/domain/source-version.ts` 仅定义实体 interface，无仓库接口 | Phase 1 验收标准第 3 条 |
| P1 | AI | AiConversation / AiMessage 无 Repository 接口 | `src/modules/ai/domain/conversation.ts` 仅定义实体 interface；全 ai/ 目录搜索 "Repository" 命中 0 条 | Phase 1 验收标准第 3 条 |
| P1 | Governance | ContentIssue 无 Repository 接口 | `src/modules/governance/domain/content-issue.ts` 仅定义实体 interface；全 governance/ 目录搜索 "Repository" 命中 0 条 | Phase 1 验收标准第 3 条 |
| P2 | Content/AI/Governance | 三个模块无 infrastructure 层实现 | `src/modules/content/infrastructure/` 为空目录；`src/modules/ai/infrastructure/` 为空目录；`src/modules/governance/infrastructure/` 为空目录 | Phase 3 数据库阶段预期 Repository 实现，但规格阶段应至少有接口定义 |
| P2 | Content/AI/Governance | 三个模块无 application 层用例 | application 目录下仅有 identity/learning/question/study-plan 四模块的用例文件，content/ai/governance 无 | Phase 1 规格应定义核心对象，application 层可后续补充 |
| P3 | 全局 | 规格文档（domain-model.md 等）不存在 | 本地文件系统中未找到 domain-model.md / business-rules.md / learning-model.md | Phase 1 审核范围明确要求基于规格文档审核，目前为反向提取 |
| P3 | 全局 | app/ 目录无实际页面文件 | `src/app/` 下仅有 `admin/` `(app)/` `(auth)/` 三个空目录骨架 | Phase 1 为规格阶段，前端未实现属正常进度 |

---

## 领域边界核验详情

### 1. Auth 与学习分离 ✅

- **User 实体**（`identity/domain/user.ts:6-16`）：仅含身份属性 — id, email, name, timezone, emailVerifiedAt, createdAt, updatedAt
- **学习属性外置**：
  - UserLearningProfile（`identity/domain/user.ts:45-52`）：dailyMinutes, dailyItemTarget, learningStage
  - UserSubjectPreference（`identity/domain/user.ts:54-61`）：subjectId, enabled, priority
- **结论**：User 聚合根不含 dailyGoal / streak / mastery 等学习状态字段，学习配置通过独立实体承载，分离清晰。

### 2. AI 与权威数据分离 ✅

- **AI 模块**（`src/modules/ai/`）：仅包含 `domain/conversation.ts`，定义 AiConversation / AiMessage 两个实体
- **全 ai/ 目录搜索** `LearningState` / `learningState`：命中 0 条
- **结论**：AI 模块无任何直接写 LearningState / canonical content 的代码，边界清晰。

### 3. Scheduler 与 UI 分离 ✅

- **接口定义**：`learning/domain/scheduler.ts:11-18` — `Scheduler` interface，仅含 `initialize(now)` 和 `review(previous, rating, now)` 两个方法
- **FSRS 适配器**：`learning/infrastructure/fsrs-scheduler.ts:41` — `FsrsScheduler implements Scheduler`，在 infrastructure 层封装 ts-fsrs
- **Domain 层零依赖**：`learning/domain/` 全目录搜索 `ts-fsrs` 命中 0 条
- **结论**：Scheduler 接口在 domain 层定义，FSRS 被适配器模式隔离，符合架构要求。

---

## 实体关系一致性核验

| 关系 | Prisma Schema | Domain 表达 | 一致性 |
|------|--------------|-------------|--------|
| User 1:1 → UserLearningProfile | `schema.prisma:134` | `user.ts:45` 实体独立 | ✅ |
| ContentItem 1:1 → Formula/Herb/AcupointContent | `schema.prisma:244-246` | `professional-content.ts` 三个 interface 各含 contentItemId | ✅ |
| ContentItem 1:N → ContentVersion | `schema.prisma:247` | `source-version.ts:16` ContentVersion 含 contentItemId | ✅ |
| ContentItem 1:N → KnowledgePoint | `schema.prisma:248` | `knowledge-point.ts:11` KnowledgePoint 含 contentItemId | ✅ |
| KnowledgePoint 1:N → LearningState | `schema.prisma:353` | `learning-state.ts:11` LearningState 含 knowledgePointId | ✅ |
| StudySession 1:N → SessionItem | `schema.prisma:410` | `session.ts:24` SessionItem 含 sessionId | ✅ |
| Attempt 1:1 → Evaluation | `schema.prisma:454` | `evaluation.ts:7` Evaluation 含 attemptId | ✅ |
| Attempt 1:1 → ReviewEvent | `schema.prisma:455` | `review-event.ts:21` ReviewEvent 含 attemptId | ✅ |
| StudyPlan 1:N → StudyPlanItem | `schema.prisma:547` | `study-plan.ts:21` StudyPlanItem 含 planId | ✅ |
| AiConversation 1:N → AiMessage | `schema.prisma:581` | `conversation.ts:18` AiMessage 含 conversationId | ✅ |
| ContentIssue → ContentItem / KnowledgePoint | `schema.prisma:618-619` | `content-issue.ts:12-14` 含 contentItemId, knowledgePointId | ✅ |

---

## 未覆盖风险

1. **规格文档缺失风险**：三份核心规格文档（domain-model.md / business-rules.md / learning-model.md）不存在，本次审核完全依赖代码反向提取，可能遗漏规格文档中定义但尚未实现的约束（如 10 条 Hard invariants 的完整列表）。

2. **状态机完整性未验证**：Attempt 状态机（`learning/domain/attempt.ts:24-27`）和 StudySession 状态机（`learning/domain/session.ts:32-35`）已在 domain 层定义，但 ContentItem / StudyPlan / StudyPlanItem 的状态机迁移函数未在 domain 层定义（仅在 Prisma enum 和类型别名中声明状态值）。

3. **事务边界验证不足**：UnitOfWork 接口（`src/shared/domain/unit-of-work.ts:6-8`）已定义，但仅 FinalizeReview（`learning/application/finalize-review.ts:90`）使用了事务，其余用例的事务边界未验证。

4. **JSON 纪律未核验**：ReviewEvent 的 previousState / nextState 在 schema 中为 Json 类型（`schema.prisma:484-485`），domain 层表达为 ReviewStateSnapshot interface（`review-event.ts:9-18`），符合"历史快照允许 JSON"的规则，但需在 Phase 3 进一步核验其余模型是否遵守 JSON 纪律。

5. **id 策略未核验**：schema 统一使用 cuid（`schema.prisma:127` 等），domain 层使用 string 类型，未见业务前缀，但需在 Phase 3 确认无 c_/h_/a_ 等语义前缀。

---

## 通过条件

若要达到"通过"，需满足以下条件：

1. **P1 修复（必须）**：
   - 在 `src/modules/content/domain/` 下新增 `repositories.ts`，定义 `ContentItemRepository` / `ContentSourceRepository` / `ContentVersionRepository` 接口
   - 在 `src/modules/ai/domain/` 下新增 `repositories.ts`，定义 `AiConversationRepository` / `AiMessageRepository` 接口
   - 在 `src/modules/governance/domain/` 下新增 `repositories.ts`，定义 `ContentIssueRepository` 接口

2. **P2 修复（建议）**：
   - 补充 ContentItem / StudyPlan 等聚合根的状态机迁移函数至 domain 层（类似 attempt.ts 的 `canTransitionAttempt`）
   - 确认规格文档（domain-model.md 等）的产出计划，或明确以代码即规格的模式推进

---

*审核完成。本报告仅作审核记录，未修改任何文件。*
