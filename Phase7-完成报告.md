# Phase 7 完成报告 —— Learning Core（第一个真正的 MVP）

> 范围：对既有 Attempt / Evaluation / Review / FSRS / LearningState 实现做验收确认，并把 MVP 完整闭环跑通。
> 基线：Phase 0~6（22 文件 / 316 测试）。本阶段后：**24 测试文件 / 320 测试，tsc 0 错误，prisma validate 通过**。
> 环境：Next.js App Router + Prisma v6 + TypeScript（type:module），Windows / PowerShell。

---

## 一、验收核对表（逐条 → 满足/缺口 → 证据）

### 1. 黄金测试真实通过（learning-model §22）—— ✅ 满足

`src/tests/e2e/golden-scenario.test.ts` 实跑 **7/7 通过**（本轮从 6 增至 7）。

非假断言证据：
- 真实用例实例化：`golden-scenario.test.ts:100-107`，注入的是**真实** `new FsrsScheduler()`（`:103`），其内部真实调用 ts-fsrs（`fsrs-scheduler.ts:71`）；只注入了可控时钟/ID/内存 UoW（`:28-31`），仓储是真实内存实现（Map 真实读写，无 mock 短路）。
- 六条断言逐条成立：
  - 恰一个 ReviewEvent：`reviewEvents.size===1`（`:119`）；恰一个 LearningState（`:123`）；Attempt/Evaluation 各一（`:133-134`）。
  - `reviewCount===1`（`:127`），快照 previous=0 / next=1（`:137-138`）。
  - `dueAt > reviewAt`（`:130`）。
  - 同 Attempt 重放 Good：`created===false`、reviewEvent 同一个、dueAt 不变（`:148-152`）。

> 说明：黄金测试用内存/no-op UoW，不测真实事务原子性——该职责由 `real-tx.test.ts` 用 SQLite + PrismaUnitOfWork 承担，是设计分工而非缺陷。

### 2. FinalizeReview 用例规则逐条验证 —— ✅ 全部满足

整段 `execute` 被 `uow.transaction(async () => { ... })` 包裹（`finalize-review.ts:96` 起，`:199` 收束），下列写入全在事务体内。

| 规则 | 结论 | 证据 |
|---|---|---|
| ① Attempt 必须已 evaluated | ✅ | 守卫 `finalize-review.ts:120-124`（`canTransitionAttempt`，未通过抛 `InvalidStateTransitionError`）；负向用例 `golden-scenario.test.ts:155-164` |
| ② 一个 Attempt 最多一个 ReviewEvent | ✅ | 应用层幂等守卫 `finalize-review.ts:103`（`findByAttemptId`）；DB 兜底 `prisma/schema.prisma:516` `ReviewEvent.attemptId @unique`（BR-030） |
| ③ LearningState 不存在时初始化 | ✅ | `finalize-review.ts:129-135`（`prevState` 为空则 `scheduler.initialize`） |
| ④ Scheduler 计算新状态 | ✅ | `finalize-review.ts:138` `scheduler.review(previous, cmd.rating, reviewedAt)`；接口 `scheduler.ts:13-17` |
| ⑤ ReviewEvent+LearningState 同一事务 | ✅ | 写入 `finalize-review.ts:162-163` 同在 `:96` 事务内；真实路径证据 `real-tx.test.ts:147-194`（成功路径四组同事务落库）与 `:196-253`（中途注入失败整体回滚） |
| ⑥ 重复请求幂等 | ✅ | `finalize-review.ts:103-117`（命中已有 ReviewEvent 即 `created:false` 返回，不二次调度）；用例 `golden-scenario.test.ts:142-153` |

附加：Attempt→reviewed（`:166`）、SessionItem→completed（`:169-177`，带 `canTransitionSessionItem` 守卫）、StudyDay 按用户时区 upsert（`:184-196`）均在事务内。

### 3. 评价与评级分离 —— ✅ 满足（本轮补齐行为级回归）

- (a) `scheduler.review` 只收 rating：调用点 `finalize-review.ts:138` 实参仅 `(previous, cmd.rating, reviewedAt)`；`fsrs-scheduler.ts:65-86` 全程只用 rating。`Evaluation` 在本用例仅在 `:180` 读一次，只为 `isCorrect`，其 `score` 从不喂 FSRS。
- (b) correctCount 读 `isCorrect` 而非 rating：`finalize-review.ts:181`（注释 BR-022）。
- (c) 行为级负向回归（本轮新增）：`golden-scenario.test.ts:187`「答错但用户选 Good（BR-022）：FSRS 仍正常推进，但 correctCount 不增加」——seed `isCorrect=false / score=0.2`，`rating:"good"` 后断言：`reviewCount===1`（`:199`，Good 仍按 FSRS 正常推进）、`StudyDay.correctCount===0`（`:206`）、原始 `isCorrect/score` 未被翻转（`:213-214`）。

### 4. MVP 完整闭环 —— ✅ 满足（本轮新建）

新建 `src/tests/integration/mvp-e2e-loop.test.ts`（真实 SQLite + PrismaUnitOfWork，1 用例，逐步落库并断言）：

```
RegisterUser → CompleteOnboarding(subjectIds:[formula])
→ GenerateStudyPlan → GetTodayPlan → StartStudySession
→ GenerateQuestion(free_recall) → SubmitAttempt → EvaluateAttempt
→ FinalizeReview(good) → CompletePlanItem → GetUserProgress
```

逐步断言：User 落库、UserSubjectPreference 落库、StudyPlan active+1 item、Session active、SessionItem 回写 questionInstanceId、Attempt submitted、Evaluation 落库、**LearningState reviewCount=1 且 dueAt>now**、SessionItem completed、StudyDay reviewCount=1、StudyPlanItem completed、coverage `{2,1}`、reviewedCount=1、dueList 未来时刻含该 KP、weakList 空。

### 5. 基础进度 + 薄弱点 —— ✅ 满足（本轮新增）

新建读模型用例 `src/modules/learning/application/get-user-progress.ts`（`GetUserProgress`，只读，注入 learningStates / reviewEvents / knowledgePoints 三仓储，入参 `{ userId, subjectId, now? }`）。

**字段（严格不折叠成单一 mastery 百分比）**：
- `coverage.{ subjectId, publishedTotal, learnedCount }`：分母=科目下已发布 KP 数，分子=该用户在该科目有 LearningState 的数。
- `reviewedCount`：该用户 ReviewEvent 总数（一次 FinalizeReview 一条，BR-030）。
- `dueList[]`：`{ knowledgePointId, dueAt, stability }`，`dueAt <= now`，按 dueAt 升序（单次上限 200）。
- `weakList[]`：见下。
- `stabilityDistribution.{ lt1day, d1to7days, d7to30days, gte30days, total }`，单位天。

**薄弱点最小判定集**（`src/modules/learning/application/get-user-progress.ts`；任一命中即入列，`reasons` 列出全部触发）：
1. `again`：ReviewEvent 历史中该 KP 评 `again` 次数 > 0（带 count）；
2. `lapse`：`LearningState.lapseCount > 0`（带 lapseCount）；
3. `low_stability`：`stability < 1` 天（阈值 `WEAK_STABILITY_THRESHOLD_DAYS = 1`，带 stability 值）。

测试 `src/tests/integration/get-user-progress.test.ts`（2 用例）：字段正确性 +「连续两次答错（两次 again）→ 进入 weakList，reasons 同时含 again(2)/lapse/low_stability」。

配套仓储读方法（未改 schema、未加迁移）：
- `LearningStateRepository.findAllByUser / countLearnedByUserAndSubject`（Prisma + 两处内存 fake 同步）
- `ReviewEventRepository.findAllByUser`
- `KnowledgePointRepository.countPublishedBySubject`

### 6. MVP 范围核对（架构 §62）

| 能力 | 状态 | 说明 |
|---|---|---|
| 注册 | ✅ | RegisterUser 跨事务，闭环内断言落库 |
| 登录 | ✅ | LoginUser / AuthSession（`real-tx.test.ts`、`identity.test.ts` 覆盖） |
| Onboarding | ✅ | CompleteOnboarding 选科目，闭环内断言 |
| 方剂 / 中药 / 腧穴 | ✅ | Subject/Evaluator 三科目可用；批量内容数据已灌（Phase 4：4167 KP） |
| KnowledgePoint | ✅ | published 分级、CRUD |
| Question | ✅ | free_recall / fill_blank / recognition 三题型端到端 |
| Attempt / Evaluation / Review | ✅ | 状态机 + BR 注释齐备 |
| FSRS / LearningState | ✅ | FsrsScheduler + BR-040 UNIQUE |
| StudySession | ✅ | Start / Resume / End 就绪 |
| StudyPlan | ⚠️ 雏形可用 | GenerateStudyPlan 支持 due 复习 + 新知识补齐；完整排序/AI 建议归 Phase 9。MVP 闭环中"生成今日计划"可跑通 |
| 今日学习 | ✅ | GetTodayPlan |
| 复习 | ✅ | dueList + FSRS |
| 基础进度 | ✅ 本轮新增 | GetUserProgress |
| 内容来源 | ❌ 缺口（Phase 11） | ContentSource / Version 模型在，无摄取管线 |
| 内容质量检查 | ❌ 缺口（Phase 11） | ContentIssue 模型在，无上报工作流 |

### 7. 回归 —— ✅ 满足

- `npx vitest run`：**24 文件 / 320 测试全部通过**（基线 316 → +4：golden +1、get-user-progress +2、mvp-e2e-loop +1），退出码 0。
- `npx tsc --noEmit`：**0 错误**。
- `npx prisma validate`：**The schema is valid**。
- 未删除 / 跳过 / 弱化任何既有测试；无假断言；未改 `prisma/schema.prisma`。

---

## 二、MVP 闭环测试说明

- 文件：`src/tests/integration/mvp-e2e-loop.test.ts`
- 接线：真实 `PrismaClient` 连 `prisma/test.db` + `PrismaUnitOfWork`（AsyncLocalStorage 透传 tx），与 `real-tx.test.ts` 同范式。
- 关键设计：全新用户无 due 数据，故闭环内先学一个 KP 产生 LearningState，再断言 dueList（now 时刻为空 / 注入未来时刻含该 KP），符合 FSRS 真实语义。
- 每一步均有真实落库断言，无空跑。

## 三、进度查询实现说明

见 §5。要点：读模型、无写、无事务；coverage 按所选科目，分母为已发布 KP 总数、分子为已有 LearningState 数；dueList / weakList 为跨科目复习队列（FSRS 语义）；所有指标分字段返回，未做单一 mastery 百分比。

## 四、薄弱点实现说明

见 §5 判定集。最小可行、有证据：基于 ReviewEvent 历史（again 次数）与 LearningState 参数（lapseCount、stability），每条带原因与数值。

## 五、测试结果汇总

| 项 | 结果 |
|---|---|
| 全仓 vitest | 24 文件 / **320 passed**（11.26s） |
| tsc --noEmit | 0 错误 |
| prisma validate | valid |
| golden-scenario | 7 passed（含新增 BR-022 负向回归） |
| mvp-e2e-loop | 1 passed（全闭环） |
| get-user-progress | 2 passed |

## 六、遗留项（分阶段）

- **Phase 8**：在 e2e 闭环内补串真实登录态（Register→Login→WhoAmI→Onboarding 用真实 token）；邮件验证 / 重置密码的真实发送；API 路由层接线。
- **Phase 9**：完整 StudyPlan 计划器（高遗忘风险 / 高重要度排序、AI 建议位、多日调度、由 weakList 反哺 weakness 类型 item、今日新知识点候选自动从科目未学 KP 选取）。
- **Phase 11**：内容来源摄取管线（PDF→ContentVersion→ContentItem/KP）、内容质量问题上报工作流、AI 出题兜底。

> 备注：规格文档 domain-model.md / business-rules.md / learning-model.md 未随本仓库提供，本阶段验收以代码内 BR-xxx 注释、既有测试与 Phase 2~6 完成报告为依据；`question-model.md` 在库。
