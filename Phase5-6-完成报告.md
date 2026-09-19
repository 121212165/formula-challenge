# Phase 5 + Phase 6 合并完成报告

> 项目：`formula-challenge-v2`（Next.js App Router + Prisma v6 + TypeScript `type:module`，Windows + PowerShell）
> 本轮同时完成 **Phase 5 — Identity（身份认证）** 与 **Phase 6 — Question Engine（题目引擎）**，两阶段端到端并行开发、后统一回归。
> 详细分阶段报告见同目录：`Phase5-完成报告.md`、`Phase6-完成报告.md`（含逐条代码/测试证据）。本报告为合并收口 + 我独立执行的全量回归证据。

---

## 0. 统一回归（我亲自执行，两阶段合并后真实跑通）

| 命令 | 结果 |
|---|---|
| `npx prisma validate` | ✅ `The schema at prisma\schema.prisma is valid`（含新增 `AuthSession`） |
| `npx prisma generate` | ✅ Prisma Client v6.19.3 生成成功 |
| `npx tsc --noEmit` | ✅ **0 错误** |
| `npm test`（vitest run 全量） | ✅ **Test Files 22 passed (22)，Tests 316 passed (316)**，Duration ~11s |

- 基线 21 文件 / 301 测试全保留、未删除/未跳过/未弱化任何既有断言；新增 1 个测试文件（question-engine-e2e）+15 用例。
- 两阶段文件边界互斥：Phase 5 只动 identity 与 schema 新增 `AuthSession`；Phase 6 只动 question 与 learning 评分接线；合并后全绿，无接口冲突。

---

## 1. Phase 5 —— Identity（核对表摘要，证据见 Phase5-完成报告.md）

| # | 验收项 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | Auth/学习系统彻底分离 | ✅ | User 无学习字段（grep dailyGoal/streak/mastery 0 命中）；identity 源码 0 处 LearningState/StudyDay 引用；新会话模型命名 `AuthSession`（表 auth_sessions）与学习 `StudySession` 物理隔离 |
| 2 | 七条链路完整用例 | ✅ | 注册/登录（签发 AuthSession）/登出（logout-session 撤销，幂等）/邮箱验证/忘记密码/重置密码/whoami 校验会话；登出后 whoami 抛 UnauthorizedError |
| 3 | 邮箱规范化查重（BR-091） | ✅ | trim+toLowerCase 后查重，重复抛 ConflictError；测试覆盖大写与前后空白视为重复 |
| 4 | 密码只存哈希（BR-092） | ✅ | 仅落 scrypt passwordHash；grep 无明文写库/无 console 打印密码；会话只存 tokenHash |
| 5 | 注册+档案原子；Onboarding 零学习状态 | ✅ | 注册事务写 User+Profile+Credential+VerifyToken；新增 complete-onboarding 建 UserSubjectPreference，零 LearningState 触碰 |
| 6 | 时区必填（BR-093） | ✅ | 缺/非法 IANA 时区抛 ValidationError（Intl 校验），测试覆盖 |
| 7 | 认证错误信息不泄露 | ✅ | 登录失败统一"邮箱或密码错误"，不区分用户不存在/密码错；忘记密码防枚举；错误类复用 shared/errors |
| 8 | 集成测试 | ✅ | identity.test.ts 17 + real-tx.test.ts 6（真实事务），覆盖事务/重复邮箱/错密码/令牌过期/登出失效 |

**新增 5 文件**：`logout-session.ts`、`whoami.ts`、`complete-onboarding.ts`、`prisma-session-repository.ts`、`prisma-subject-preference-repository.ts`。
**修改 8 文件**：schema.prisma（加 AuthSession）、user.ts/repositories.ts/prisma-identity-repos.ts/login-user.ts、in-memory 仓（仅追加）、identity.test.ts、real-tx.test.ts。

---

## 2. Phase 6 —— Question Engine（核对表摘要，证据见 Phase6-完成报告.md）

| # | 验收项 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | 三题型端到端；ordering 不退化 | ✅ | 模板实例化→渲染→QuestionInstance 落库（knowledgePointId+templateId+sequence）→作答→评价；ordering/缺模板在**写库前**显式报错，无孤儿实例 |
| 2 | 确定性生成优先 | ✅ | free_recall 复述 title 取 canonicalAnswer；fill_blank 从 canonical 结构化挖空（正确项=被挖项，生成/评分同源）；recognition 正确项+同类型干扰项（FNV-1a 稳定排序） |
| 3 | 三科目 Evaluator 统一契约；BR-022 | ✅ | Formula/Herb/AcupointEvaluator 统一返回 EvaluationResult{score,isCorrect,confidence,feedback}；free_recall 归一化（NFKC+去标点空白小写+/、/多候选+命中比例）、fill_blank 逐空+同义词、recognition 精确匹配；grep+测试断言零 LearningState 修改 |
| 4 | AI 生成边界 | ✅（本轮不做） | 明确记录 AI 兜底留待 Phase 11，已按 question-model.md §5 预留校验接口/注释 |
| 5 | 题型扩展解耦 | ✅ | registry.ts：`Map<QuestionType,{generator}>`，新增题型不改 Scheduler/FSRS/LearningState/ReviewEvent |
| 6 | 测试 | ✅ | question-engine-e2e 8 用例：三题型各正确/错误两路径、归一化容差、同义词、干扰项不含正确答案、ordering/缺模板显式报错、三科目契约 |
| 7 | 与 question-model.md 一致性 | ✅ | §2/§3 各条目落点对照表见 Phase6-完成报告.md |

**新增 7 文件**：`rendered-question.ts`、`scoring.ts`、`template-config.ts`、`generator.ts`、`registry.ts`、`subject-evaluators.ts`、`question-engine-e2e.test.ts`。
**修改 3 文件**：`generate-question.ts`（可选 registry 渲染+ordering 门控）、learning 侧 `evaluator.ts`（向后兼容加可选字段）、`evaluate-attempt.ts`（消除 `?? "free_recall"` 静默退化，缺模板显式 NotFoundError）。
> 说明：为打通"作答→评价"闭环，Phase 6 对 learning 应用层做了向后兼容的最小接线（EvaluationContext 加可选字段、消除静默退化），连带回归 learning-flow 9 用例全绿，未改学习引擎核心语义。

---

## 3. 遗留项（两阶段合并）

1. **HTTP/邮件层未接**：会话令牌与验证/重置令牌目前到应用用例+集成测试，未接 cookie/header 路由与真实邮件发送通道（后续 Phase）。
2. **会话为单设备模型**：每次登录新建 AuthSession，不主动踢旧会话；如需全端登出可加 `revokeAllByUser`。
3. **recognition 干扰项 DB 来源**：暂走注入端口 `findSiblings`；`KnowledgePointRepository.findPublishedByType` 生产接线时再补（避免越界改 knowledge 接口）。
4. **AI 兜底生成**：留待 Phase 11。
5. **ordering 题型**：枚举保留、本轮不落地；多空位 fill_blank 已支持但测试以单空为主，后续可补。

---

## 4. 交付物

- `Phase5-完成报告.md`、`Phase6-完成报告.md`（分阶段逐条证据）
- 本合并报告 `Phase5-6-完成报告.md`
- 代码：identity 5 新增 / 8 修改；question 7 新增 / 3 修改；schema 仅新增 `AuthSession`
