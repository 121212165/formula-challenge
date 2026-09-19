# Phase 8 + Phase 9 完成报告 —— Session 全生命周期 + HTTP API + 完整 Study Plan 计划器

> 范围：Phase 8（学习会话全生命周期 + HTTP API 路由）与 Phase 9（完整 Study Plan 计划器）。
> 基线：Phase 0~7（24 测试文件 / 320 测试通过、tsc 0 错误）。
> 本阶段后：**27 测试文件 / 335 测试通过（+15），tsc --noEmit 0 错误**（组织者独立复跑确认）。
> 环境：Next.js App Router 项目骨架 + Prisma v6 + TypeScript（type:module），Windows / PowerShell。

---

## 〇、本轮架构取舍（先说明，避免误读）

1. **Next.js / React 未在本仓库安装**（package.json 无 next/react，node_modules 无 next）。为不破坏 320 测试基线、不引入重型框架版本风险，HTTP 层采用**框架无关的 Web `Request`/`Response` handler**（与 Next.js App Router handler 签名完全一致，后续装好 next 可直接落到 `app/api/**`），并通过内置 `node:http` 起真实服务器 + 全局 `fetch()` 完成"可被 HTTP 调用"的验收。路由物理目录为 `src/server/routes/`（不是空的 `src/app/`）。
2. **Prisma 只在组合根 `src/server/container.ts` 出现一次**；路由 handler 全部不 import `@prisma/client`（已 grep 确认零命中），只调组合根绑定的用例/查询函数。
3. 现有测试零删除、零弱化；签名演进（EndSession 加 userId 等）只同步修正既有调用点。

---

## 一、Phase 8 验收核对表

| # | 验收点 | 结论 | 证据 |
|---|---|---|---|
| 1 | Session 状态机强制 active→completed/abandoned，禁反向；守卫唯一真源 | ✅ | `src/modules/learning/domain/session.ts:32` `canTransitionSession`；唯一调用点 `end-session.ts` Complete/Abandon。反向迁移抛 `InvalidStateTransitionError`（409）。 |
| 2 | Session 只属于一个用户；越权抛 ForbiddenError | ✅ | Resume：session 存在但 userId 不符 → `ForbiddenError`（`resume-session.ts`）；EndSession 命令新增 `userId`，事务内归属校验（`end-session.ts`）；SubmitAttempt 本就 403（`submit-attempt.ts:88`）；HTTP 层 B 访问 A 资源 → 403。负向测试 `session-phase8.test.ts`。 |
| 3 | Plan 与 Session 分离；放弃会话不使计划失效 | ✅ | Abandon 只写 StudySession.status + 不累计 StudyDay（`end-session.ts:58`），完全不碰 StudyPlan；SessionItem 在 StartStudySession 时实例化为 pending（`start-study-session.ts:69`）。 |
| 4 | 会话恢复 Resume：Attempt 历史完整、completed 保持、pending 保持、恢复策略、有测试 | ✅ | `resume-session.ts` 纯读返回 items+nextItem；不变式测试 `session-phase8.test.ts`「active 会话含 completed/active/pending 三态 + 两条 Attempt；Resume 后各态不变、Attempt 字段完整、nextItem=首个 pending/active」。 |
| 5 | SessionItem 状态受控 pending→active→completed/skipped；completed 不可回 pending | ✅ | `canTransitionSessionItem`（`session.ts:42`）被三处写路径调用：SubmitAttempt（pending→active）、FinalizeReview（→completed）、NextSessionItem（pending→active）。completed/skipped 合法表为空。 |
| 6 | 三种"完成"不混用 | ✅ | 全模块唯一写 `SessionItem.status="completed"` 的位置是 `finalize-review.ts`；Start 只建 pending；Submit/Next 只 pending→active；CompleteSession 不碰 item。Attempt 完成≠Review 完成≠PlanItem 完成。 |
| 7 | HTTP API 路由（组合根/鉴权/错误映射/端点/集成测试） | ✅ | 见下方端点清单与冒烟测试。`src/server/container.ts` 组合根；`auth.ts` Bearer→WhoAmI；`http-errors.ts` 错误→状态码；`router.ts` 分发；`node-server.ts` 真实监听；`api-http-loop.test.ts` 真实 fetch 闭环。 |
| 8 | 回归全绿、tsc 0 错误 | ✅ | 组织者复跑：27 文件 / 335 测试通过；tsc 0 错误。 |

### Phase 8 新增用例
- `NextSessionItem`（`learning/application/next-session-item.ts`）：取 active 会话下第一个 pending item，经守卫 pending→active，返回 `{session,item,questionInstanceId}`。
- 既有用例收紧：`ResumeSession` 越权改 ForbiddenError；`CompleteSession/AbandonSession` 命令加 `userId` 归属校验。

---

## 二、Phase 9 验收核对表

| # | 验收点 | 结论 | 证据 |
|---|---|---|---|
| 1 | 候选三路齐全（due / weakness / 新 KP） | ✅ | `generate-study-plan.ts`：due=`learningStates.findDue`；weakness=复用 get-user-progress 判定（again 次数/lapseCount>0/stability<1 且 dueAt>now，避免与 due 重复）；new=`listPublishedBySubject` 自发现并排除已学/draft。测试 `study-plan-planner.test.ts` 用例1。 |
| 2 | 优先级 due>高遗忘>近期连续错误>高重要度>新知识 | ✅ | `compareCandidates`：review tier0 < weakness tier1 < new tier2；review 段 dueAt 升序；weakness 段 stability 升→lapseCount 降→againCount 降；weight 跨段兜底（重要度当前为可配置软信号，代码注释说明）。 |
| 3 | 一用户一本地日一活跃计划；时区正确 | ✅ | `UNIQUE(userId,localDate)`（schema BR-060）+ `findByLocalDate` 幂等；同日重复 generate 返回同一 plan（测试用例3）。localDate 由 `createGetLocalDate`（Intl，用户 IANA 时区）在 HTTP 层计算。 |
| 4 | PlanItem 完成不改 LearningState（BR-062） | ✅ | CompletePlanItem/SkipPlanItem 只 `saveItem`，从不调 `learningStates.save`；测试用例5 逐字段比对前后无变化。 |
| 5 | AI 不能绕过 PlanGenerator（BR-063） | ✅ | `plan.source` 在 use case 内写死 `"scheduler"`（测试断言）；本轮无 AI 调用；无路由/其他层直写 `planRepo.saveItem` 的公开入口。 |
| 6 | 尊重日预算（dailyMinutes/dailyItemTarget），超预算裁剪 | ✅ | 组合根 `profileReader.getDailyItemTarget` 读 UserLearningProfile.dailyItemTarget（读不到回退 10）；`candidates.slice(0, dailyItemTarget)`，高优先级保留；测试用例2（注入=2，低优先级 new 被裁）。dailyMinutes 记录不参与裁剪。 |
| 7 | 状态机 draft→active→completed / active→expired 经守卫 | ✅ | `canTransitionPlan`（study-plan.ts）；新增 `canTransitionPlanItem`（pending→completed/skipped）；complete/skip 负向测试（completed 后再 complete/expire 抛 InvalidStateTransitionError，用例6）。 |
| 8 | Today Plan 查询可用 | ✅ | `GET /api/study-plans/today` → getLocalDate → GetTodayPlan；冒烟测试 200。 |
| 9 | 回归全绿、tsc 0 错误 | ✅ | 同 Phase 8 回归结果。 |

### Phase 9 新增用例
- `SkipPlanItem`（`study-plan/application/skip-plan-item.ts`）：pending→skipped，幂等，非法态抛错。
- `GenerateStudyPlan` 重写为三路候选 + 优先级 + 预算裁剪；保留 `newKnowledgePointIds` 作为可选覆盖。
- KnowledgePointRepository 新增只读 `listPublishedBySubject(subjectId)`（Prisma 实现 + 内存 fake 同步）。

---

## 三、HTTP API 端点清单

| 方法 | 路径 | 鉴权 | 行为 / 成功码 |
|---|---|---|---|
| POST | /api/auth/register | 公开 | RegisterUser → 201 |
| POST | /api/auth/login | 公开 | LoginUser（签发 token）→ 200 |
| POST | /api/auth/logout | Bearer | LogoutSession 撤销 → 200 |
| GET | /api/me | Bearer | WhoAmI → 200 |
| GET | /api/subjects | Bearer | enabled 科目列表 → 200 |
| GET | /api/content?subjectId= | Bearer | published contentItem 列表 → 200 |
| GET | /api/content/:id | Bearer | 单个 contentItem → 200/404 |
| GET | /api/content/:id/knowledge-points | Bearer | 该内容下 published KP → 200 |
| POST | /api/sessions | Bearer | StartStudySession → 201 |
| POST | /api/sessions/:id/items | Bearer | NextSessionItem（userId 取自 token）→ 200 |
| POST | /api/sessions/:id/items/:itemId/question | Bearer | 校验归属后 GenerateQuestion → 200 |
| POST | /api/attempts | Bearer | SubmitAttempt（clientRequestId 幂等）→ 200/201 |
| POST | /api/attempts/:id/review | Bearer | EvaluateAttempt + FinalizeReview(rating) → 200 |
| GET | /api/progress?subjectId= | Bearer | GetUserProgress 全量 → 200 |
| GET | /api/progress/due?subjectId= | Bearer | dueList 只读切片 → 200 |
| GET | /api/progress/weaknesses?subjectId= | Bearer | weakList 只读切片 → 200 |
| GET | /api/study-plans/today | Bearer | 按用户时区 GetTodayPlan → 200 |
| POST | /api/study-plans/generate | Bearer | GenerateStudyPlan（注入 profileReader）→ 200 |
| POST | /api/study-plans/:id/items/:itemId/complete | Bearer | 先校验 plan 归属 → CompletePlanItem → 200 |
| POST | /api/study-plans/:id/items/:itemId/skip | Bearer | 先校验 plan 归属 → SkipPlanItem → 200 |

**错误→HTTP 状态码映射**（`src/server/http-errors.ts`）：401 Unauthorized / 403 Forbidden / 422 Validation / 404 NotFound / 409 Conflict·InvalidStateTransition·ContentNotPublished·DuplicateRequest。

---

## 四、可运行证据（真实 HTTP）

`src/tests/integration/api-http-loop.test.ts` 用内置 `node:http` 起在随机端口，全局 `fetch()` 驱动：

`register 201 → login 200(拿 token) → /me 200 → /subjects 200 → /content 200 → /content/:id/knowledge-points 200 → study-plans/generate 200 → study-plans/today 200 → sessions 201 → sessions/:id/items 200 → question 200 → attempts 200(created:true) → attempts/:id/review 200 → progress 200(reviewedCount=1) → items/complete 200(item.completed)`。

负向：无 token `/me` → **401**；B 访问 A 的 session/plan → **403**；重复 clientRequestId 再提交 → **200 且 created:false（幂等）**。

---

## 五、测试结果（组织者独立复跑）

| 项 | 结果 |
|---|---|
| `npx vitest run` | **27 文件 / 335 测试全部通过**（12.3s，退出码 0） |
| `npx tsc --noEmit` | **0 错误**（TSC_EXIT=0） |
| 相对基线 | 24→27 文件、320→335 测试（+3 文件 +15 用例） |

新增测试：`session-phase8.test.ts`(7)、`study-plan-planner.test.ts`(6)、`api-http-loop.test.ts`(2)；同步修正 `session-plan-contract / session-study-plan / study-plan-state-machine / mvp-e2e-loop` 等调用点，断言未弱化。

---

## 六、本轮新增/修改文件

**新增**
- HTTP 层：`src/server/{container,auth,http-errors,http-helpers,router,index,node-server}.ts`、`src/server/routes/{auth,content,session,progress,study-plan}-handlers.ts`
- 用例：`src/modules/learning/application/next-session-item.ts`、`src/modules/study-plan/application/skip-plan-item.ts`
- 测试：`src/tests/integration/{session-phase8,study-plan-planner,api-http-loop}.test.ts`

**修改**
- `resume-session.ts`、`end-session.ts`（归属校验收紧）
- `generate-study-plan.ts`（三路+优先级+预算）、`study-plan/domain/study-plan.ts`（+`canTransitionPlanItem`）
- `knowledge-point-repository.ts` + Prisma 实现（+`listPublishedBySubject`）、内存 fake 同步
- 既有测试调用点随签名演进同步

---

## 七、遗留项（归后续阶段）

- **Phase 10（真正 Next.js 化）**：安装 next/react；把 `src/server/routes/*.ts` 落成 `src/app/api/**/route.ts` 薄封装（当前 handler 已是 Next 兼容签名，可直接平移）；补根 `layout.tsx`/`page.tsx`；`npm run dev` 真起 Next server 验证。
- **Phase 10**：`POST /api/auth/logout`、`GET /api/progress/due`、`/weaknesses` 已接线并类型/路由就绪，但未纳入冒烟主链路单独发请求（语义由各自用例测试覆盖）。
- **Phase 11**：生产 `createContainer()` 默认连 `DATABASE_URL`（Postgres），本轮未对真实 Postgres 起服务验证（冒烟走测试 SQLite 已证明全链路）；内容来源摄取管线、内容质量问题上报、AI 出题兜底、邮件验证/重置真实发送。
- 高重要度排序当前为可配置软信号（无 KP 重要度字段），待内容模型补字段后做实。
