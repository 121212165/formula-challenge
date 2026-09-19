# Phase 2 —— Domain（领域层）完成报告

> 项目：formula-challenge-v2（Next.js App Router + Prisma v6 + TypeScript，ESM）
> 范围：核心领域实体补齐 + 不可变事实防篡改 + 状态机领域层强制 + 全部 TDD 契约单元/集成测试。
> 报告日期：2026-09-18。

---

## 一、验收核对表（逐条 → 满足/缺口 → 证据）

### 1. 核心实体完整且正确，不可变事实防篡改 —— ✅ 满足

| 实体 | 结论 | 证据 |
|---|---|---|
| KnowledgePoint | ✅ | `src/modules/knowledge/domain/knowledge-point.ts`：id/contentItemId/code/type/title/canonicalAnswer/explanation/difficulty/weight/status/sortOrder 齐全（Session/Plan 组实体核对通过） |
| Attempt | ✅ 不可变 | `src/modules/learning/domain/attempt.ts:13-27` 全部字段 `readonly`；`createImmutableAttempt`（:35-37）运行时 `Object.freeze`；无公开 setter |
| Evaluation | ✅ | `evaluation.ts`：id/attemptId/score/isCorrect/confidence/feedback/createdAt；isCorrect 与记忆评级分离（domain-constructors.test.ts） |
| ReviewEvent | ✅ 不可变 | `review-event.ts` 字段 readonly；`createImmutableReviewEvent` 冻结事件本体 + 深冻结前后快照 |
| LearningState | ✅ 单一构造器 | `learning-state.ts:69-97` `LearningStateFromDraft` 唯一工厂 |
| StudySession / SessionItem | ✅ | `session.ts` 字段齐全，状态机守卫齐全 |
| StudyPlan / StudyPlanItem | ✅ | `study-plan.ts` 字段齐全 |

防篡改证据：`src/tests/unit/learning-facts-immutable.test.ts`（14 例）断言工厂产物 `Object.isFrozen`、运行时字段赋值失效、`canTransitionAttempt("reviewed","reviewed")===false`、`submitted→reviewed` 跳步拒绝。

### 2. Attempt 状态机领域层强制 —— ✅ 满足

- 唯一真源守卫：`attempt.ts:39-42` `canTransitionAttempt`（严格线性 submitted→evaluated→reviewed，仅允许 +1）。
- 守卫接线：`evaluate-attempt.ts:76`（submitted→evaluated）、`finalize-review.ts:118`（evaluated→reviewed）。
- 禁止 reviewed→reviewed、reviewed 前必须 evaluated：`state-machines.test.ts`（attempt 段全组合枚举）+ `learning-facts-immutable.test.ts` + `review-contract.test.ts`（R-2 未 evaluated 拒绝且不写任何记录）。

### 3. LearningState 唯一性 / 单一构造器 / Review 只经 Scheduler —— ✅ 满足

- UNIQUE(userId, knowledgePointId) 领域表达：`learning-state.ts:71-78` 工厂内空 userId / 空 knowledgePointId 抛 `ValidationError`。
- 单一构造器初始化：`LearningStateFromDraft`，用例不再散落手写字面量（`finalize-review.ts` 已接入）。
- Review 只经 Scheduler 变更状态：`finalize-review.ts` 中 `previous` 不存在时走 `scheduler.initialize()`，推进走 `scheduler.review(...)`；Evaluation 不触碰 LearningState。

### 4. Scheduler 接口为项目自有，ts-fsrs 完全隔离 —— ✅ 满足

- 自有接口：`scheduler.ts:11-18`，签名 `initialize(now)` / `review(previous, rating, now)`。
- ts-fsrs 仅出现在 infrastructure 适配器 `learning/infrastructure/fsrs-scheduler.ts`。
- 隔离证据：`scheduler-contract.test.ts` 的"架构隔离证据"用例运行时读取 `src/modules/learning/domain/` 源码，断言对 `ts-fsrs` 的 `import/require` **0 命中**（唯一子串命中为 `learning-state.ts:41` JSDoc 注释文字，非依赖）。

### 5. 显式错误语义 —— ✅ 满足

`src/shared/errors/index.ts`：`ValidationError / NotFoundError / ConflictError / InvalidStateTransitionError / DuplicateRequestError / ContentNotPublishedError / UnauthorizedError / ForbiddenError`，均继承 `DomainError`；全仓无裸 throw 字符串。

### 6. TDD 契约（learning-model §21）逐条覆盖 —— ✅ 满足

| 契约 | 条目 | 证据（测试文件 / 用例） |
|---|---|---|
| **Scheduler** | S-1 新条目确定性合法初始态 | `unit/scheduler-contract.test.ts`（5 例：同 now 两次 initialize 深相等、数值归零、时间锚定、fsrsState=New） |
| | S-2 Again 推进 dueAt | `scheduler-contract.test.ts`（dueAt>now、reviewCount=1、lastRating=again） |
| | S-3 Hard/Good/Easy 各自合法 next state | `scheduler-contract.test.ts`（it.each hard/good/easy + good>again dueAt、easy≥good stability、hard≤good stability） |
| | S-4 Review 永不产生非法状态 | `scheduler-contract.test.ts` 性质化用例（17 条长度 5~10 评级序列串联，恒满足 reviewCount 单调/fsrsState∈{0,1,2,3}/dueAt 有效/lastRating 正确/数值有限） |
| **Attempt** | A-1 合法提交恰好 1 个 Attempt | `integration/learning-flow.test.ts`（创建 submitted Attempt + store.attempts.size 断言） |
| | A-2 同 clientRequestId 返回同一 Attempt | `learning-flow.test.ts`（第二次 created:false、同 id、store 仍 1 个；含 TOCTOU P2002 兜底） |
| | A-3 非法 question/session 归属被拒 | `integration/review-contract.test.ts`：(a) 跨用户 → ForbiddenError；(b1) 未挂实例 → NotFoundError；(b2) 实例 sessionItemId 不匹配 → NotFoundError |
| **Review** | R-1 已评价 Attempt 可 Review | `e2e/golden-scenario.test.ts` + `learning-flow.test.ts` 黄金链路 |
| | R-2 未评价不可 Review | `review-contract.test.ts`（R-2：submitted 态拒绝且 ReviewEvent/LearningState 均为 0）+ golden 用例 |
| | R-3 同一 Attempt 不可 Review 两次 | `review-contract.test.ts`（R-3：二次 created:false，ReviewEvent 仍 1 个） |
| | R-4 Review+LearningState 原子 | `review-contract.test.ts`（R-4：保存 ReviewEvent 后注入失败，二者均未落库，半成功不发生） |
| | R-5 重放请求不二次推进 | `review-contract.test.ts`（R-5：同 rating 重放，dueAt/reviewCount 不变） |
| **Session** | S-1 SessionItem 属于该 Session | `integration/session-plan-contract.test.ts`（Resume 只回本 session items、跨 session/跨用户 NotFoundError） |
| | S-2 completed 项不可回 pending | `session-plan-contract.test.ts`（canTransitionSessionItem completed/skipped 无出边；集成级 FinalizeReview/CompleteSession 不回退） |
| | S-3 abandoned 会话保留 Attempt 历史 | `session-plan-contract.test.ts`（Abandon 后 Attempt 仍可 findById，status=abandoned） |
| **Plan** | P-1 每用户/本地日仅 1 活跃计划 | `session-plan-contract.test.ts`（同日二次生成仍 1 个、返回同 plan；跨用户隔离） |
| | P-2 PlanItem 完成不改 LearningState | `session-plan-contract.test.ts`（逐字段比对仓储 LearningState 未变） |
| | P-3 计划器尊重日条目/时长预算 | `session-plan-contract.test.ts`（maxReview=2/maxNew=3 裁到 5 条；默认上限 10/5 裁到 15 条） |
| | P-4 到期候选优先于新知识点 | `session-plan-contract.test.ts`（全部 review 段在 new 段之前且按 dueAt 升序） |

### 7. 黄金测试（learning-model §22）—— ✅ 通过

`src/tests/e2e/golden-scenario.test.ts`（6 例）：首次复习恰好 1 Attempt + 1 Evaluation + 1 ReviewEvent + 1 LearningState、reviewCount=1、dueAt 在未来；同一 Review 重放不二次推进；未 evaluated 拒绝；不存在 Attempt 抛 NotFound；StudyDay 按时区累计。

### 8. 回归 —— ✅ 通过

- 全量 `npx vitest run`：**19 个测试文件、259/259 通过**（基线 211，净增 48 条，无删除/跳过/弱化）。
- `npx tsc --noEmit`：**退出码 0，0 错误**。
- 无假断言；既有 211 条测试原样保留且全绿。

### 9. 本报告 —— ✅ 即 `Phase2-完成报告.md`

---

## 二、新增 / 修改清单

**新增测试文件（4 个，+48 用例）**
- `src/tests/unit/scheduler-contract.test.ts`（14）
- `src/tests/unit/learning-facts-immutable.test.ts`（14）
- `src/tests/integration/review-contract.test.ts`（7）
- `src/tests/integration/session-plan-contract.test.ts`（13）

**修改源文件（领域层）**
- `src/modules/learning/domain/attempt.ts`：字段 readonly + `createImmutableAttempt`（Object.freeze）。
- `src/modules/learning/domain/review-event.ts`：字段 readonly + `createImmutableReviewEvent`（深冻结快照）。
- `src/modules/learning/domain/learning-state.ts`：新增唯一工厂 `LearningStateFromDraft` + UNIQUE 空归属保护。
- `src/modules/learning/application/submit-attempt.ts`：内部改用 `createImmutableAttempt`（公开签名不变）。
- `src/modules/learning/application/finalize-review.ts`：改用 `createImmutableReviewEvent` 与 `LearningStateFromDraft`（公开签名不变）。

**修复预存在失败（本阶段审计中发现，非新增范围但回归所必需）**
- `src/modules/identity/application/verify-email.ts`：注入可测时钟 `now?: () => Date`（与其它用例一致），消除"固定注册时钟 + 真实系统时钟漂移导致 24h 验证令牌误判过期"的时间炸弹。
- `src/tests/integration/identity.test.ts`：该用例传入 `now: () => NOW`，使邮箱验证用例确定性通过（断言未弱化，二次使用拒绝分支仍在）。

---

## 三、测试结果

```
 Test Files  19 passed (19)
      Tests  259 passed (259)
```
`npx tsc --noEmit` → exit 0。

---

## 四、遗留项

- 无阻塞性缺口。
- 备注：领域文档 `learning-model.md` 等四份规格原文件不在工作区（仅 `question-model.md` 与 P1/P2 审核报告在），本阶段以任务清单中的 TDD 契约为准逐条核对，结论均有上述测试与代码证据支撑。
- 备注：本版本 ts-fsrs@4.7.1 下，新卡首评 `easy` 直接进入 Review 态、`again/hard/good` 留在 Learning 态；测试按真实行为断言并留注释，未写死直觉值。
