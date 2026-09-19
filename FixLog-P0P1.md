# FixLog — Phase 1 P0/P1 修复记录

> 修复日期：2026-09-18
> 对应审核报告：`Phase1-规格定稿-综合审核报告.md`
> 修复范围：全部 P0（3 项）+ P1（11 项）+ 假测试 F-1
> 修复前测试基线：5 文件 / 33 用例
> 修复后测试结果：**13 文件 / 180 用例全部通过，tsc --noEmit 0 错误**

---

## 一、P0 阻断项修复

### P0-1：医疗安全边界零声明零实现

**审核问题**：全仓库无"医疗""诊断""处方""safety""disclaimer"任何字样；AI 无输出安全过滤器。

**修复内容**：
1. 新建医疗安全边界声明模块，明确禁止行为清单（诊断/处方/剂量/医疗建议/疗效承诺）。
2. 实现基于关键词的 AI 输出安全过滤器，违规内容标记 `safe=false` 并列出命中原因。
3. 定义免责声明常量。
4. 在 AI 域建立输出校验器契约，组合安全过滤器实现 `MedicalOutputValidator`。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/shared/domain/medical-safety.ts` | `MedicalSafetyPolicy` 接口 + `MEDICAL_SAFETY_POLICY` 常量（五项禁止）、`AiOutputSafetyFilter` 接口、`MEDICAL_VIOLATION_KEYWORDS`（中英双语 12+ 关键词）、`KeywordMedicalSafetyFilter` 实现、`MEDICAL_SAFETY_DISCLAIMER` 常量 |
| `src/modules/ai/domain/safety.ts` | `AiOutputValidator` 接口、`MedicalOutputValidator` 实现（组合 KeywordMedicalSafetyFilter） |

**测试证据**：
- `src/tests/unit/medical-safety.test.ts`（6 用例）：违规内容→safe=false、正常内容→safe=true、DISCLAIMER 断言
- `src/tests/unit/medical-safety-extended.test.ts`（13 用例）：空串/纯英文放行、保守策略（"这不是诊断"仍命中）、多关键词同时命中、Validator 契约

---

### P0-2：ContentItem 状态机完全缺失

**审核问题**：无 `canTransitionContent`、无 Publish/Review/Archive 用例，draft→published 直通无防护。

**修复内容**：
1. 领域层添加 `canTransitionContent` 守卫函数，定义合法路径：draft→review→published→archived，支持 review→draft（驳回）、published→review（重审）、archived→published（恢复）；**禁止 draft→published 直通**。
2. 新建 5 个应用层用例，每个用例调用守卫函数，非法迁移抛 `InvalidStateTransitionError`，全部在 `uow.transaction` 内。
3. 新建 `ContentItemRepository` 接口。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/modules/content/domain/content.ts:44-56` | `canTransitionContent(from, to)` 守卫 |
| `src/modules/content/domain/repositories.ts:9-16` | `ContentItemRepository` 接口（findById/findBySlug/findByStatus/save） |
| `src/modules/content/application/submit-content-review.ts` | draft→review |
| `src/modules/content/application/publish-content.ts` | review→published |
| `src/modules/content/application/archive-content.ts` | published→archived |
| `src/modules/content/application/reject-content.ts` | review→draft（驳回，含 reason） |
| `src/modules/content/application/revise-content.ts` | published→review（重审） |

**测试证据**：
- `src/tests/integration/content-state-machine.test.ts`（5 用例）：draft→review→published→archived 全路径通过；draft→published 直通被拒（断言错误码 INVALID_STATE_TRANSITION 且状态未变）；published→review 重审合法；archived→published 恢复经守卫合法
- `src/tests/unit/state-machines.test.ts`（83 用例中 ContentItem 部分）：枚举全部 4×4=16 种 (from,to) 组合

---

### P0-3：StudyPlan 状态机缺失

**审核问题**：新建 plan 直接 `status:"active"` 跳过 draft；无 completed/expired 迁移；无 `canTransitionPlan`。

**修复内容**：
1. 领域层添加 `canTransitionPlan` 守卫：合法路径 draft→active→completed，active→expired；completed/expired 为终态。
2. 修改 `GenerateStudyPlan`：先创建 `status:"draft"` 的 plan 并保存，经守卫校验后显式迁移到 `active` 并二次保存，全程在同一事务内。
3. 新建 `CompleteStudyPlan`（active→completed）和 `ExpireStudyPlan`（active→expired）用例。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/modules/study-plan/domain/study-plan.ts:31-42` | `canTransitionPlan(from, to)` 守卫 |
| `src/modules/study-plan/application/generate-study-plan.ts:83-113` | 创建 draft→守卫校验→置 active 二次保存 |
| `src/modules/study-plan/application/complete-study-plan.ts` | active→completed |
| `src/modules/study-plan/application/expire-study-plan.ts` | active→expired |

**测试证据**：
- `src/tests/integration/study-plan-state-machine.test.ts`（5 用例）：generate 落库序列断言为 `["draft","active"]` 且最终 active；active→completed/expired 合法；completed 再流转被拒；draft 直接 complete 被拒
- `src/tests/unit/state-machines.test.ts`（StudyPlan 部分）：枚举 4×4 组合

---

## 二、P1 严重项修复

### P1-1：三模块缺 6 个 Repository 接口

**审核问题**：ContentItem/ContentSource/ContentVersion/AiConversation/AiMessage/ContentIssue 共 6 个聚合根无仓库接口。

**修复内容**：为三域分别创建 repositories.ts，定义全部 6 个接口及聚合接口。

**代码位置**：
| 文件 | 接口 |
|---|---|
| `src/modules/content/domain/repositories.ts` | `ContentItemRepository`（findById/findBySlug/findByStatus/save）、`ContentSourceRepository`（findById/findAll/save）、`ContentVersionRepository`（findById/findByContentItem/findLatest/save）、`ContentRepositories` 聚合 |
| `src/modules/ai/domain/repositories.ts` | `AiConversationRepository`（findById/findByUser/save）、`AiMessageRepository`（findById/findByConversation/save）、`AiRepositories` 聚合 |
| `src/modules/governance/domain/repositories.ts` | `ContentIssueRepository`（findById/findByContentItem/findByStatus/save）、`GovernanceRepositories` 聚合 |

**测试证据**：各接口被对应应用层用例真实调用（见 P1-5 测试）。

---

### P1-2：状态机守卫函数死代码

**审核问题**：`canTransitionAttempt`、`canTransitionSession` 定义后零调用，守卫全部内联在用例层。

**修复内容**：将 5 处内联状态判断替换为调用领域守卫函数；新增 `canTransitionSessionItem` 守卫并接线。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/learning/application/evaluate-attempt.ts:74` | `attempt.status !== "submitted"` → `!canTransitionAttempt(attempt.status, "evaluated")` |
| `src/modules/learning/application/finalize-review.ts:116` | → `!canTransitionAttempt(attempt.status, "reviewed")` |
| `src/modules/learning/application/end-session.ts:42` | `session.status !== "active"` → `!canTransitionSession(session.status, to)` |
| `src/modules/learning/application/submit-attempt.ts:112` | pending→active 改用 `canTransitionSessionItem` 守卫 |
| `src/modules/learning/application/finalize-review.ts:174` | SessionItem→completed 增加 `canTransitionSessionItem` 守卫，**禁止 pending 直跳 completed** |

**测试证据**：
- `golden-scenario.test.ts`（6 用例）：非法状态拒绝断言仍通过
- `learning-flow.test.ts`（8 用例）：Session completed 拒绝提交、已评价不重复评价
- `state-machines.test.ts`（83 用例）：全部守卫函数枚举测试

---

### P1-3：三个错误类死代码 + 未发布知识点误用 NotFoundError

**审核问题**：`ForbiddenError`、`DuplicateRequestError`、`ContentNotPublishedError` 零 import；未发布知识点误用 `NotFoundError`（404 语义应为 403）。

**修复内容**：
1. `GenerateQuestion`/`SubmitAttempt`/`EvaluateAttempt` 区分"知识点不存在"（NotFoundError）和"知识点未发布"（ContentNotPublishedError）。
2. `SubmitAttempt` 中越权访问他人 session 由 `InvalidStateTransitionError` 改为 `ForbiddenError`。
3. `DuplicateRequestError` 保留定义并加注释：幂等场景返回 `created:false` 不抛错，此错误预留给非幂等写操作。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/question/application/generate-question.ts:49-55` | findById 判断存在性 → 未发布抛 ContentNotPublishedError |
| `src/modules/learning/application/submit-attempt.ts:74` | 越权 → ForbiddenError |
| `src/modules/learning/application/submit-attempt.ts:88` | 未发布 kp → ContentNotPublishedError |
| `src/modules/learning/application/evaluate-attempt.ts:80` | 未发布 kp → ContentNotPublishedError |
| `src/shared/errors/index.ts:56` | DuplicateRequestError 加用途注释 |

**测试证据**：`question-engine.test.ts`、`learning-flow.test.ts` 相关用例通过；错误类被真实 import。

---

### P1-4：无真实事务实现

**审核问题**：`UnitOfWork` 唯一实现是测试 no-op（`return fn()`），全仓无 `prisma.$transaction`。

**修复内容**：
1. 新建 `PrismaUnitOfWork` 生产实现，构造接收 PrismaClient，`transaction(fn)` 内部调用 `prisma.$transaction`。
2. 新建 `createNoopUnitOfWork()` 测试辅助，各测试统一改用它替代内联 no-op。
3. 安装 `prisma@6` + `@prisma/client@6`（registry 默认拉到 Prisma 8 RC 无 generate 命令，固定 v6 稳定版），`prisma generate` 成功。

**代码位置**：
| 文件 | 内容 |
|---|---|
| `src/shared/infrastructure/prisma-unit-of-work.ts` | `PrismaUnitOfWork` 类，`prisma.$transaction(async () => fn())` |
| `src/tests/e2e/helpers/noop-unit-of-work.ts` | `createNoopUnitOfWork()` 导出 |
| `package.json` | devDependencies 新增 prisma@6 / @prisma/client@6 |

**说明**：当前仓储接口不暴露 tx 参数，`PrismaUnitOfWork.transaction` 的 fn 不接收 tx。这是架构限制，已在代码注释中如实记录。生产环境仓储需内部持有同一 PrismaClient 实例或通过上下文传递。

**测试证据**：全部 180 测试在 no-op UoW 下通过；PrismaUnitOfWork 类型检查通过。

---

### P1-5：BR-080/081/082 仅注释声明

**审核问题**：ContentSource/ContentVersion 表存在但无导入校验用例、无版本写用例、无 CreateIssue 审核任务用例。

**修复内容**：新建 3 个治理用例。

**代码位置**：
| 文件 | 用例 |
|---|---|
| `src/modules/governance/application/create-content-issue.ts` | `CreateContentIssue`：校验 contentItemId 存在，创建 status=pending 的 issue，uow.transaction 内 |
| `src/modules/content/application/import-content-source.ts` | `ImportContentSource`：title 非空校验，创建 ContentSource |
| `src/modules/content/application/create-content-version.ts` | `CreateContentVersion`：校验 contentItem 存在，version 号 findLatest()+1 自增，uow.transaction 内 |

**测试证据**：
- `src/tests/integration/content-governance.test.ts`（6 用例）：pending issue 创建、缺失 contentItem 抛错、source 创建/空 title 抛错、version 1→2 自增

---

### P1-6：VerifyEmail / ResetPassword 两次连续 save 未包事务

**审核问题**：token 已 usedAt 但 user.emailVerifiedAt 未写的半成功风险。

**修复内容**：两个用例的 Deps 增加 `uow: UnitOfWork`，将两次 save 包入 `uow.transaction`。

**代码位置**：
| 文件 | 修改 |
|---|---|
| `src/modules/identity/application/verify-email.ts` | VerifyEmailDeps 加 uow；token save + user save 包事务 |
| `src/modules/identity/application/reset-password.ts` | ResetPasswordDeps 加 uow；credential save + token save 包事务 |

**测试证据**：`identity.test.ts`（7 用例）全部通过，两处构造均传入 no-op uow。

---

### P1-7：StudyDay.completedSessionCount 永远为 0

**审核问题**：`CompleteSession` 不更新 StudyDay，`finalize-review.ts:187` 保留旧值。

**修复内容**：`EndSessionDeps` 增加 `getLocalDate` 注入；session save 成功后，**仅 completed 时** upsert StudyDay：`completedSessionCount + 1`，`minutes += round(durationSeconds/60)`，其余字段保留旧值；abandoned 不累加。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/learning/application/end-session.ts:18` | EndSessionDeps 加 getLocalDate |
| `src/modules/learning/application/end-session.ts:57-72` | completed 时 upsert StudyDay |

**测试证据**：`session-study-plan.test.ts`（9 用例）通过，Complete/Abandon 构造均传入 getLocalDate。

---

### P1-8：无 unit 测试目录

**审核问题**：`src/tests/unit/` 不存在，domain 纯函数无单元测试。

**修复内容**：建立 unit 测试目录，新建 4 个测试文件共 124 个用例（含已有 medical-safety.test.ts 共 130 用例）。

**代码位置**：
| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `src/tests/unit/state-machines.test.ts` | 83 | 5 个状态机守卫枚举全部 (from,to) 组合 + 边界专项 |
| `src/tests/unit/medical-safety-extended.test.ts` | 13 | 医疗安全边界/保守策略/免责声明/Validator |
| `src/tests/unit/fsrs-mapping.test.ts` | 12 | FsrsScheduler initialize/review 契约 |
| `src/tests/unit/domain-constructors.test.ts` | 16 | isContentVisible、LearningStateDraft、Evaluation 契约、Attempt 幂等 |
| `src/tests/unit/medical-safety.test.ts` | 6 | 医疗安全基础（P0-1 子代理创建） |

**测试证据**：`npx vitest run src/tests/unit/` → 5 文件 / 130 用例全部通过。

---

### P1-9：题目链路断口

**审核问题**：`GenerateQuestion` 建实例后不回写 `SessionItem.questionInstanceId`，而 `SubmitAttempt` 依赖它查题。

**修复内容**：`GenerateQuestionDeps` 增加 `sessionItems: SessionItemRepository`；`saveInstance` 后查 sessionItem 并回写 `questionInstanceId = instance.id`。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/question/application/generate-question.ts:44` | deps 解构加 sessionItems |
| `src/modules/question/application/generate-question.ts:81-85` | saveInstance 后回写 SessionItem.questionInstanceId |

**测试证据**：
- `question-engine.test.ts`：传入 sessionItems 仓库并新增回写断言
- `learning-flow.test.ts:323`：传入 repos.sessionItems，断言 questionInstanceId 正确回写（替换原先手工 set）

---

### P1-10：StudyDay.correctCount 用 ReviewRating 反推正确率

**审核问题**：`finalize-review.ts:184` 用 `rating === "again" ? 0 : 1` 反推，答错但选 good 会被误计为正确，违反评价/评级分离（BR-022）。

**修复内容**：upsert StudyDay 前通过 `repos.evaluations.findByAttemptId(attempt.id)` 查 Evaluation，`correctDelta = evaluation?.isCorrect ? 1 : 0`；`reviewCount` 仍 +1（复习次数与评级无关）。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `src/modules/learning/application/finalize-review.ts:182-184` | 查 Evaluation，correctDelta 读 isCorrect |
| `src/modules/learning/application/finalize-review.ts:195` | correctCount += correctDelta |

**测试证据**：
- `golden-scenario.test.ts`（6 用例）：黄金场景 seed 的 isCorrect=true → correctCount=1，断言保持通过
- `domain-constructors.test.ts`：构造 rating="again" 但 isCorrect=true 的 Evaluation，证明评价与评级分离

---

### P1-11：Credential 实体无 Prisma 模型

**审核问题**：domain 定义了 Credential 与 CredentialRepository，register-user 真实写入，但 prisma schema 无 Credential 模型。

**修复内容**：
1. schema 新增 `Credential` 模型（userId 主键、passwordHash、级联删除）。
2. User 模型增加 `credential Credential?` 关系字段。
3. `prisma generate` 暴露并修复了 4 个预先存在的关系反向字段缺失（KnowledgePoint 补 sessionItems/attempts/reviewEvents[]；Evaluation 补 userId + user 关系以满足 User.evaluations）。

**代码位置**：
| 文件:行 | 修改 |
|---|---|
| `prisma/schema.prisma:135` | User 加 `credential Credential?` |
| `prisma/schema.prisma:204-211` | 新增 `model Credential`（@@map("credentials")） |
| `prisma/schema.prisma:476-491` | Evaluation 补 userId + user 关系 |
| `prisma/schema.prisma` KnowledgePoint 段 | 补 sessionItems/attempts/reviewEvents 反向关系 |

**测试证据**：`npx prisma generate` 成功生成客户端；`identity.test.ts`（7 用例）注册四表同写断言通过（含 Credential 写入）。

---

## 三、假测试修复

### F-1：session-study-plan.test.ts:300 `void review` 未调用

**审核问题**："FinalizeReview 后 StudyPlan 不受影响"用例中 `void review` 根本没调用 `review.execute()`，却声称验证 Review 不影响计划。

**修复内容**：删除 `void review`，真实 seed Session(active) + SessionItem(active) + Attempt(evaluated) + Evaluation，调用 `review.execute({attemptId, rating:"good"})`，断言 `created===true`、`reviewCount===1`，且 StudyPlan 条目仍为 `pending`。

**代码位置**：`src/tests/integration/session-study-plan.test.ts:280-304`

**测试证据**：该用例现在真实执行 FinalizeReview 全流程，断言通过。

---

## 四、V2 核心不变量验证

修复后全仓测试通过，以下核心不变量均被真实测试守护：

| 不变量 | 测试 | 状态 |
|---|---|---|
| 首次复习恰好 1 Attempt+1 Evaluation+1 ReviewEvent+1 LearningState | `golden-scenario.test.ts` | ✅ |
| reviewCount=1、dueAt 在未来 | `golden-scenario.test.ts` | ✅ |
| 同一 Review 重放不二次推进 | `golden-scenario.test.ts` | ✅ |
| UNIQUE(attemptId) / UNIQUE(userId,knowledgePointId) / UNIQUE(userId,localDate) | schema + 幂等测试 | ✅ |
| 评价与评级分离（BR-020/022） | `finalize-review.ts` 读 Evaluation.isCorrect + `domain-constructors.test.ts` | ✅ |
| 幂等（clientRequestId） | `learning-flow.test.ts` | ✅ |
| 时区用户优先（getLocalDate 注入） | `finalize-review.ts` + `end-session.ts` | ✅ |
| AI 不直接修改 LearningState | ai 模块零 LearningState 引用 | ✅ |

---

## 五、P2 项（不在本轮修复范围）

以下 P2 项审核报告中标注为"可随开发任务修复"，本轮未处理：

| # | 问题 | 说明 |
|---|---|---|
| P2-1 | createInitialLearningStateDraft 死代码 + BR-042 注释错名 | 实际走 scheduler.initialize，函数保留未删 |
| P2-2 | 幂等 TOCTOU（findByClientRequestId 与 save 之间无并发保护） | 生产层靠 DB UNIQUE 兜底 |
| P2-3 | draftToCard 还原时硬编码 State.Review，FSRS 首次 again 后应为 Learning 态 | FSRS 适配器保真问题 |
| P2-4 | SessionItem pending 直跳 completed | **已顺手修复**（P1-2 中增加 canTransitionSessionItem 守卫） |
| P2-5 | StudyPlan draft/expired/completed 永不可达 | **已修复**（P0-3） |
| P2-6 | BR-071 编号重载 | 编号唯一性问题，待规格文档重建时拆分 |
| P2-7 | question-model 缺失导致题型规格缺口 | Phase 6 前补 question-model.md |
| P2-8 | RegisterUser 对缺时区默认 Asia/Shanghai 而非拒绝 | BR-093 时区必填，待 onboarding 流程确定 |
| P2-9 | CompletePlanItem 未注入 UnitOfWork | 风格不一致 |
| P2-10 | 时区转换无实现（getLocalDate 是注入接口，无 IANA tz 转换代码） | 生产实现待补 |
| P2-11 | AI 边界仅靠缺席，无运行时守卫 | P0-1 已补安全过滤器，Prompt Injection 防护待 AI 用例实现时补 |
| P2-12 | 三模块无 application 层用例 | **已大幅修复**（Content 5 个 + Governance 1 个 + StudyPlan 2 个），AI 用例待 Phase 11 |

---

## 六、测试结果汇总

```
修复前： 5 文件 / 33 用例
修复后：13 文件 / 180 用例 全部通过

Test Files  13 passed (13)
     Tests  180 passed (180)
  Duration  3.17s

npx tsc --noEmit → exit 0（0 错误）
npx prisma generate → 成功（Prisma Client v6.19.3）
```

### 按层级分布
| 层级 | 文件数 | 用例数 |
|---|---|---|
| unit | 5 | 130 |
| integration | 7 | 44 |
| e2e | 1 | 6 |
| **合计** | **13** | **180** |

---

*本 FixLog 逐条回指 `Phase1-规格定稿-综合审核报告.md` 中的 P0/P1 问题编号。综合审核报告本身未修改。*
