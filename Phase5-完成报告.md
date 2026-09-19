# Phase 5 — Identity（身份认证）完成报告

- 项目：`formula-challenge-v2`（Next.js App Router + Prisma v6 + TypeScript `type:module`，Windows + PowerShell）
- 范围：仅 identity 模块 + schema 新增 `AuthSession` 模型；未触碰 `src/modules/question/**` 及其测试。
- 结论：**8 条验收 checklist 全部满足**；`prisma validate` / `prisma generate` / `tsc --noEmit`（0 错误）/ identity 相关 vitest 全部真实跑通。

---

## ① 验收 Checklist 逐条证据

### 1. Auth 与学习系统彻底分离
- `User` 模型只有身份字段（id/email/name/timezone/emailVerifiedAt/时间戳）。grep `dailyGoal|streak|mastery` 在 `prisma/schema.prisma` 中 **0 命中**。
- identity 源码 grep `LearningState|StudyDay|StudyPlan|StudySession|learningState|studyDay|mastery|dailyGoal|streak`：**0 处实际引用**；唯一命中是 `complete-onboarding.ts` 顶部注释“全程不触碰 LearningState/StudyDay/StudyPlan/StudySession”（文档注释，非代码引用）。
- 新增的会话模型刻意命名为 `AuthSession`（表 `auth_sessions`），与学习域 `StudySession`（表 `study_sessions`）物理隔离，避免概念混淆。

### 2. 七条链路完整用例
注册 / 登录 / 登出 / 邮箱验证 / 忘记密码 / 重置密码 / 会话管理：
- 注册：`register-user.ts`（既有）。
- 登录：`login-user.ts` —— 登录成功后**签发 `AuthSession`**（存 sha256(token) + expiresAt），返回明文令牌一次。
- 登出：`logout-session.ts`（新增）—— 按 token 哈希标记 `revokedAt`，幂等。
- 邮箱验证：`verify-email.ts`（既有）。
- 忘记密码：`request-password-reset.ts`（既有，防枚举）。
- 重置密码：`reset-password.ts`（既有）。
- 会话管理：`whoami.ts`（新增）—— 校验会话存在/未撤销/未过期，回读用户；登出后 whoami 抛 `UnauthorizedError`（测试证据见 ③）。

### 3. 邮箱规范化后查重（BR-091）
- `register-user.ts`：`const email = cmd.email.trim().toLowerCase();` 后再 `findByEmail`，重复抛 `ConflictError("该邮箱已注册")`。
- 测试：`identity.test.ts`
  - “重复邮箱注册抛 ConflictError”：`EMAIL.toUpperCase()` 命中。
  - 新增“BR-091：邮箱前后空白 + 大小写归一化视为重复 → ConflictError”：`"  " + EMAIL.toUpperCase() + "  "` 命中 `ConflictError`。

### 4. 密码只存哈希（BR-092）
- grep identity 源码 `password:\s*(cmd\.|plain)|console\.log`：**0 命中**（无明文落库、无 console 打印密码）。
- 注册/重置只落 `passwordHash`（`Credential.passwordHash`，scrypt 格式 `scrypt$N$r$p$salt$hash`）；`scrypt-password-hasher.ts` 用 `timingSafeEqual` 校验。
- 会话令牌同理：库里只存 `tokenHash`，明文仅在登录响应出现（测试断言 `row.tokenHash !== sessionToken`）。

### 5. RegisterUser + InitialProfile 原子；Onboarding 零学习状态
- 注册事务：`register-user.ts` 在 `uow.transaction` 内写 User + UserLearningProfile + Credential + EmailVerificationToken（BR-071），`real-tx.test.ts` 已断言四行同事务落库、重复 email 走 DB `@unique`→`ConflictError`。
- 新增 `complete-onboarding.ts`：同一事务内兜底 profile（幂等，不覆盖既有学习配置）+ 写 `UserSubjectPreference`（选科目）。**全程零 LearningState 触碰**（identity 内存仓根本不持有学习状态表，测试断言 `Object.keys(store)` 不含 `learningStates`）。

### 6. 时区必填（BR-093）
- `register-user.ts`：空时区 → `ValidationError("时区必填（BR-093）")`；非合法 IANA → `ValidationError`（`Intl.DateTimeFormat` 校验）。
- 既有测试已覆盖：缺时区 / 空时区 / `Mars/Olympus` / 合法时区 trim 落库。

### 7. 认证错误信息泄露防护
- 登录失败统一 `UnauthorizedError("邮箱或密码错误")`：用户不存在与密码错误走同一分支（`login-user.ts`：`if (!user || !ok) throw ...`）。
- 忘记密码对不存在邮箱返回 `resetToken:null`（防枚举）。
- 错误类复用 `src/shared/errors/index.ts`（UnauthorizedError/ConflictError/ValidationError/NotFoundError），未自造错误类型。
- whoami 对“会话不存在/已撤销/已过期”统一 `UnauthorizedError("登录态无效/已过期")`，不泄露细分原因。

### 8. 集成测试
- 沿用既有 `identity.test.ts`（内存仓 + noop UoW）与 `real-tx.test.ts`（真实 SQLite + PrismaUnitOfWork）同款写法。
- 覆盖：事务回滚（既有 real-tx FinalizeReview 用例保留）、重复邮箱 `ConflictError`、错误密码 `UnauthorizedError`、验证/重置令牌一次性与过期、登出后会话失效、真实库 `auth_session` 落库与 `revokedAt`。

---

## ② 新增 / 修改用例与实现清单

**新增文件（5）**
- `src/modules/identity/application/logout-session.ts` —— 登出（撤销会话，幂等）。
- `src/modules/identity/application/whoami.ts` —— 校验登录态，回读当前用户。
- `src/modules/identity/application/complete-onboarding.ts` —— Onboarding（选科目 + 兜底 profile，零学习状态）。
- `src/modules/identity/infrastructure/prisma-session-repository.ts` —— `AuthSession` 仓储（按 tokenHash 查 / id upsert，走 `getClient` 事务适配）。
- `src/modules/identity/infrastructure/prisma-subject-preference-repository.ts` —— `UserSubjectPreference` 仓储（按 `@@unique([userId,subjectId])` upsert）。

**修改文件（8）**
- `prisma/schema.prisma` —— 新增 `model AuthSession`（表 `auth_sessions`）+ `User.authSessions` 关系；未改任何 question_*/learning 模型。
- `src/modules/identity/domain/user.ts` —— 新增 `AuthSession` 领域接口。
- `src/modules/identity/domain/repositories.ts` —— 新增 `SessionRepository`、`SubjectPreferenceRepository`；`IdentityRepositories` 增加 `sessions`、`subjectPrefs`。
- `src/modules/identity/infrastructure/prisma-identity-repos.ts` —— 装配两个新仓储。
- `src/modules/identity/application/login-user.ts` —— 登录签发会话（`uow` 可选；不传时保持旧行为只返回 user，向后兼容既有测试）。
- `src/tests/e2e/helpers/in-memory-domain-repos.ts` —— **仅追加** identity 内存仓 `sessions` / `subjectPrefs`（未删改任何既有方法，未碰 question 部分）。
- `src/tests/integration/identity.test.ts` —— 新增“登录会话/登出/whoami”“Onboarding”两个 describe 块。
- `src/tests/integration/real-tx.test.ts` —— 新增真实事务会话链路 describe 块（+import）。

**自动产物（非手写）**
- `prisma/schema.test.prisma`：由 `scripts/build-sqlite-schema.cjs` 在 vitest globalSetup 自动从 `schema.prisma` 派生，已含 `AuthSession` / `auth_sessions`（grep 确认）。
- `src/tests/integration/.sqlite-client`：由 `prisma db push` 自动重新生成（含 `authSession` delegate）。

---

## ③ 测试结果（真实输出摘要）

命令与真实结果：

1. `npx prisma validate`
   - `The schema at prisma\schema.prisma is valid 🚀`，EXIT 0。
2. `npx prisma generate`
   - `✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client`，EXIT 0。
3. `npx tsc --noEmit`
   - 无任何输出，EXIT 0（**0 错误**）。
4. `npx vitest run src/tests/integration/identity.test.ts src/tests/integration/real-tx.test.ts`
   - globalSetup：`[build-sqlite-schema] 已生成 prisma\schema.test.prisma` → SQLite `test.db` reset 并与 schema 同步 → 重新生成 sqlite client。
   - 结果：
     ```
     ✓ src/tests/integration/real-tx.test.ts (6 tests) 884ms
     ✓ src/tests/integration/identity.test.ts (17 tests) 2479ms
     Test Files  2 passed (2)
          Tests  23 passed (23)
       Duration  12.12s
     ```
   - 含本次新增用例：BR-091 空白+大小写查重、登录签发会话/ whoami/登出失效、会话过期、伪造令牌、登出幂等、Onboarding 选科目、Onboarding 校验、真实库 auth_session 落库与 revokedAt。

> 按要求未跑全量 `npm test`（留待统一回归）；未删除/跳过/弱化任何既有测试与断言。

---

## ④ 遗留项

- `src/infrastructure/auth/` 目录本次未新增文件（会话令牌哈希逻辑沿用各用例内联 `node:crypto` 的既有风格，与 register/verify/reset 一致）；如后续要抽公共 session-token 工具可再放此处。
- 会话目前为单设备模型（每次登录新建一条 `auth_session`，不主动踢旧会话）；如需“全端登出/单端互踢”可在 `SessionRepository` 增加 `revokeAllByUser`，当前验收未要求。
- 未接入 HTTP 层（cookie/header 绑定）与邮件发送通道；本次只到应用层用例 + 集成测试，API 路由属后续接线。
- `schema.test.prisma` 为派生产物，请勿手改；改 `schema.prisma` 后由 globalSetup 自动重建。
