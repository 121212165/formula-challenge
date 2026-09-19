# Phase 3 完成报告 —— SQLite 真实库测试基建 / Migration 基线与回滚 / 真实事务集成测试

> 项目：formula-challenge-v2（Next.js App Router + Prisma v6.19.3 + TS，ESM）
> 本轮目标：为既有 Prisma 仓储与 ALS 事务设施补上**真实数据库**（SQLite）测试基建、Postgres migration 基线与 down 回滚、真实事务集成测试，并跑通全量回归。
> 结论：**全量 264 个测试全绿（旧 259 + 新增 5），`tsc --noEmit` 0 错误，`prisma validate` / `prisma generate` 通过。**

---

## (a) 验收标准核对表（逐条）

| # | 验收项 | 结论 | 证据（文件 / 测试名） |
|---|--------|------|------------------------|
| 1 | Schema 与领域实体关系一致 | ✅ 满足 | `prisma/schema.prisma`（30 个模型，8 个领域，全部外键关系）；`npx prisma validate` 输出 `The schema at prisma\schema.prisma is valid` |
| 2 | 关键唯一约束齐全 | ✅ 满足 | `prisma/migrations/0001_init/migration.sql`：`review_events_attemptId_key`、`learning_states_userId_knowledgePointId_key`、`study_days_userId_localDate_key`、`study_plans_userId_localDate_key`、`attempts_userId_clientRequestId_key` 全部生成 |
| 3 | JSON 纪律 | ✅ 满足 | 全模型仅 5 处 Json：`FormulaContent.alias`、`HerbContent.alias`（SQLite 数组不可用的明确例外）、`QuestionTemplate.config`（题目配置）、`ReviewEvent.previousState/nextState`（不可查询历史快照）。无可查询业务字段被滥用作 Json |
| 4 | 全部 Repository 有 Prisma 生产实现，domain 零 `@prisma/client` | ✅ 满足 | 20 个 `Prisma*Repository`（见 (c)）；仓储对 `@prisma/client` 仅 `import type`（运行时擦除），domain 接口文件纯 TS，无 Prisma import |
| 5 | 事务真实对接（tx 传递、跨仓储原子） | ✅ 满足 | `src/tests/integration/real-tx.test.ts`：FinalizeReview 成功/回滚、RegisterUser 四表同事务；`PrismaUnitOfWork` 经 ALS 传 tx |
| 6 | Migration 可回滚 | ✅ 满足 | `prisma/migrations/0001_init/down.sql`：DROP 全部 30 表（CASCADE，先依赖后被依赖）+ 16 个枚举类型 |
| 7 | ID 统一 cuid / uuid，无语义前缀 | ✅ 满足 | 全部 `@id @default(cuid())`；`Credential.userId`、`FormulaContent.contentItemId` 等为关联主键，未加业务前缀 |
| 8 | SQLite 真实库集成测试（原子性 / 幂等 / ≥2 类事务 / UNIQUE→ConflictError） | ✅ 满足 | `real-tx.test.ts` 5 个用例：FinalizeReview 成功、FinalizeReview 中途失败回滚、RegisterUser 跨表事务、重复 email→ConflictError、SubmitAttempt 幂等 |
| 9 | 回归（≥259+新增、tsc 0、prisma validate/generate、不删旧测试） | ✅ 满足 | `npm test` → **264 passed (20 files)**；`tsc --noEmit` exit 0；旧 9 个单测 + 9 个集成 + e2e golden 全部未改动、未跳过、全绿 |
| 10 | 本报告 | ✅ 满足 | 即本文 |

---

## (b) Schema 变更摘要（本轮相对 Phase 2 canonical 的改动）

canonical `prisma/schema.prisma` 保持 **postgresql** 不变。本轮（沿用 hint 现状）关键列：

1. `LearningState.fsrsState Int @default(0)` —— FSRS 卡片状态机原值（New/Learning/Review/Relearning），对应 domain `LearningState.fsrsState`。
2. `User.emailVerifiedAt DateTime?` —— 邮箱验证时间。
3. `FormulaContent.alias` / `HerbContent.alias`：由 `String[]` 改为 `Json @default("[]")`（SQLite 原生不支持数组，仓储负责 `string[] <-> Json` 序列化），并在 schema 注释中说明此为例外。

本轮**未再改 canonical schema 结构**；仅新增派生 SQLite 变体 `prisma/schema.test.prisma`（由脚本生成，不入库）。

---

## (c) Repository 实现清单（domain 接口 ↔ Prisma 生产实现）

聚合工厂：`createPrismaLearningRepos`、`createPrismaIdentityRepos`、`createPrismaContentRepos`、`createPrismaAiRepos`、`createGovernanceRepos`；knowledge / question / study-plan 为单类。

| 领域 | 文件 | 实现类 | 实现的 domain 接口 |
|------|------|--------|--------------------|
| learning | `learning/infrastructure/prisma-attempt-repository.ts` | PrismaAttemptRepository | AttemptRepository |
| learning | `learning/infrastructure/prisma-evaluation-repository.ts` | PrismaEvaluationRepository | EvaluationRepository |
| learning | `learning/infrastructure/prisma-learning-state-repository.ts` | PrismaLearningStateRepository | LearningStateRepository |
| learning | `learning/infrastructure/prisma-review-event-repository.ts` | PrismaReviewEventRepository | ReviewEventRepository |
| learning | `learning/infrastructure/prisma-study-session-repository.ts` | PrismaStudySessionRepository | StudySessionRepository |
| learning | `learning/infrastructure/prisma-session-item-repository.ts` | PrismaSessionItemRepository | SessionItemRepository |
| learning | `learning/infrastructure/prisma-study-day-repository.ts` | PrismaStudyDayRepository | StudyDayRepository |
| identity | `identity/infrastructure/prisma-user-repository.ts` | PrismaUserRepository | UserRepository |
| identity | `identity/infrastructure/prisma-user-profile-repository.ts` | PrismaUserProfileRepository | UserProfileRepository |
| identity | `identity/infrastructure/prisma-credential-repository.ts` | PrismaCredentialRepository | CredentialRepository |
| identity | `identity/infrastructure/prisma-auth-token-repository.ts` | PrismaAuthTokenRepository | AuthTokenRepository |
| content | `content/infrastructure/prisma-content-item-repository.ts` | PrismaContentItemRepository | ContentItemRepository |
| content | `content/infrastructure/prisma-content-source-repository.ts` | PrismaContentSourceRepository | ContentSourceRepository |
| content | `content/infrastructure/prisma-content-version-repository.ts` | PrismaContentVersionRepository | ContentVersionRepository |
| knowledge | `knowledge/infrastructure/prisma-knowledge-point-repository.ts` | PrismaKnowledgePointRepository | KnowledgePointRepository |
| question | `question/infrastructure/prisma-question-repository.ts` | PrismaQuestionRepository | QuestionRepository |
| study-plan | `study-plan/infrastructure/prisma-study-plan-repository.ts` | PrismaStudyPlanRepository | StudyPlanRepository |
| ai | `ai/infrastructure/prisma-ai-conversation-repository.ts` | PrismaAiConversationRepository | AiConversationRepository |
| ai | `ai/infrastructure/prisma-ai-message-repository.ts` | PrismaAiMessageRepository | AiMessageRepository |
| governance | `governance/infrastructure/prisma-content-issue-repository.ts` | PrismaContentIssueRepository | ContentIssueRepository |

配套基础设施（非仓储接口实现）：`FsrsScheduler implements Scheduler`、`ScryptPasswordHasher implements PasswordHasher`，以及各聚合工厂文件（`prisma-*-repos.ts` / `infrastructure/index.ts`）。

> 本轮真实库测试额外暴露并修复了一处生产仓储缺陷：`PrismaSessionItemRepository.save` 原用裸 `create`，对已存在 SessionItem 的状态迁移（pending→active→completed）会撞 `@@unique([sessionId, position])`。已改为按 `id` upsert（与 `LearningState`/`ReviewEvent`/`User` 仓储一致），未改动任何旧测试断言。

---

## (d) 事务方案说明（AsyncLocalStorage 传 tx，use case 零改动）

- `src/shared/infrastructure/prisma-unit-of-work.ts`：
  `transaction(fn) = prisma.$transaction((tx) => runWithTx(tx, fn))`。
- `src/shared/infrastructure/prisma-tx-context.ts`：用 `AsyncLocalStorage<TxClient>` 持有当前事务客户端；`getClient(root)` 在事务内返回 `tx`，否则返回根 `PrismaClient`。
- 每个生产仓储的每个方法都通过 `getClient(this.prisma)` 取客户端。因此 `uow.transaction(async () => { ...跨仓储写... })` 内的所有仓储自动共享同一物理连接/事务；任一步抛错，`$transaction` 整体回滚。
- **为什么 use case 零改动**：`UnitOfWork.transaction(fn)` 接口签名不变，`fn` 不接收 tx；tx 的传递完全由基础设施层（ALS）在背后完成。`FinalizeReview` / `RegisterUser` 等用例代码一行未改即获得真实跨聚合原子性。
- 本轮用真实库证明：①RegisterUser 的 User+Profile+Credential+Token 同事务落库；②FinalizeReview 的 ReviewEvent+LearningState+SessionItem+StudyDay 同事务落库；③中途注入失败后，已写入的 ReviewEvent/LearningState/Attempt 状态/StudyDay 全部回滚（见 (e)/(f)）。

---

## (e) Migration 与回滚说明

- **基线（Postgres）**：
  `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  → `prisma/migrations/0001_init/migration.sql`（714 行：16 个 enum、30 张表、全部唯一约束与索引）。
- **回滚**：`prisma/migrations/0001_init/down.sql`，`DROP TABLE ... CASCADE` 先删依赖方再删被依赖方，最后 `DROP TYPE` 全部枚举。
- **本地重置路径**：
  - 生产/Postgres：`npm run db:push`（= `prisma db push`）或 `npm run db:migrate`（= `prisma migrate dev`）。
  - 测试用 SQLite（无需 Postgres）：`npm test` 时 vitest `globalSetup` 自动执行
    `node scripts/build-sqlite-schema.cjs` → 再 `npx prisma db push --schema prisma/schema.test.prisma --force-reset --accept-data-loss`，每次跑前清空 `prisma/test.db` 并重建。
  - 手动重建测试库：`node scripts/build-sqlite-schema.cjs; npx prisma db push --schema prisma/schema.test.prisma --force-reset --accept-data-loss`。

---

## (f) 测试结果

- `npx prisma validate`（canonical postgres schema）：✅ valid。
- `npx prisma generate`（canonical postgres client）：✅ 成功。
- `npx tsc --noEmit`：✅ **0 错误**。
- `npm test`（= `vitest run`）：✅ **Test Files 20 passed (20)，Tests 264 passed (264)**。
  - 旧基线 259 个全部保留并全绿（unit 9 文件、integration 9 文件、e2e golden），未删除 / 未跳过 / 未弱化任何断言。
  - 新增 `src/tests/integration/real-tx.test.ts` **5 个真实库用例**：
    1. `FinalizeReview 成功路径：ReviewEvent+LearningState+SessionItem+StudyDay 在同一事务落库`
    2. `FinalizeReview 中途注入失败：事务回滚（ReviewEvent/LearningState/StudyDay/Attempt 状态均不落）`
    3. `RegisterUser：User+Profile+Credential+Token 在同一事务落库`
    4. `RegisterUser 重复 email → ConflictError（User.email @unique）`
    5. `SubmitAttempt 同一 (userId,clientRequestId) 第二次 created:false，DB 仅一条 Attempt（@@unique 兜底）`

---

## (g) 遗留项（如实记录）

1. **SQLite 特性差异**：SQLite 不支持 Postgres enum / JSONB；Prisma 自动把 enum 映射为 TEXT、Json 映射为 SQLite Json，对本 schema 透明。canonical 仍是 postgresql，测试仅用 SQLite 做"行为等价"验证，不替代 Postgres 生产验证。
2. **并发写锁**：真实库测试集中在单文件内串行执行（避免 SQLite 多 worker 写同一 `prisma/test.db` 的锁竞争）；多进程并发写 SQLite 未做压测。TOCTOU 并发窗口由 DB `@@unique([userId, clientRequestId])` 兜底，已用 SubmitAttempt 幂等用例验证。
3. **P2002 应用层映射**：`RegisterUser` 重复 email 的 ConflictError 由用例预检 `findByEmail` 触发（非并发窗口）；`SubmitAttempt` 的 P2002→`created:false` 在用例内 catch 后重查，已用真实库用例证明。
4. **测试产物不入库**：`prisma/test.db`、`prisma/schema.test.prisma`、`src/tests/integration/.sqlite-client/` 已加入 `.gitignore`，每次 `npm test` 由 globalSetup 重建，无需手工清理。
5. **SessionItem 仓储修复**：见 (c)，`save` 由 `create` 改 `upsert` 是本轮真实库测试暴露并修复的生产缺陷，旧 in-memory 测试行为不变。
