# Phase 12 完成报告 —— 内容治理（Governance）后端闭环、测试与最小管理端视图

> 范围：仅实现 Phase 12 内容治理闭环；**未触碰学习域（Attempt/ReviewEvent/LearningState/Session 等）一行代码**；**未实现/未触碰 AI 模块（Phase 11 已按用户指示整体跳过）**。

## 一、实现清单

### 1. 领域层：ContentIssue 状态机守卫
- 文件：`src/modules/governance/domain/content-issue.ts`
- 新增 `canTransitionIssue(from, to): boolean`，白名单式守卫，与 `canTransitionContent` 同款写法。
- 导出 `CONTENT_ISSUE_TYPES` 常量（HTTP 层类型校验复用）。

### 2. 应用层：ReviewContentIssue 用例
- 文件：`src/modules/governance/application/review-content-issue.ts`（新建）
- 输入：`issueId / reviewerId / decision(accept|reject) / resolution? / sourceId? / contentHash? / createdBy?`
- 输出：`{ issue, version, item, idempotent }`
- 流程：加载 Issue → 终态幂等返回 → `pending→reviewing` → 按 decision 分支（reject 置 rejected；accept 在同一事务内完成 published→review→新版本→published→accepted）。

### 3. 组合根接线
- 文件：`src/server/container.ts`
- 装配 `createPrismaContentRepos`（contentItems / contentVersions）、`createGovernanceRepos`、`CreateContentIssue`、`ReviewContentIssue`。
- `Container` 接口新增：`createContentIssue / reviewContentIssue / governanceRepos / isAdminEmail`。
- `createContainer(prisma, opts?)` 新增可选 `adminEmails`；缺省时读环境变量 `ADMIN_EMAILS`（逗号分隔）。

### 4. HTTP 路由
- 文件：`src/server/routes/governance-handlers.ts`（新建）
- 注册：`src/server/index.ts`
- reporterId / reviewerId 一律取鉴权用户，不信任 body。

### 5. 最小管理端视图
- 文件：`src/app/admin/page.tsx` + `src/app/admin/admin.css`（新建）
- 复用 globals.css 的宣纸/墨/朱砂/草本/金 token 与卡片/按钮/胶囊基元，夜间模式自动接管。

## 二、三条端点与用例映射

| 方法 | 路径 | 鉴权 | 处理函数 | 调用途例 |
|---|---|---|---|---|
| POST | `/api/content-issues` | 登录用户 | `postContentIssue` | `createContentIssue.execute`（reporterId 取自当前用户） |
| GET | `/api/admin/content-issues?status=` | 仅管理员 | `getAdminContentIssues` | `governanceRepos.contentIssues.findByStatus(status)`（默认 pending） |
| POST | `/api/admin/content-issues/:id/review` | 仅管理员 | `postAdminReviewContentIssue` | `reviewContentIssue.execute`（reviewerId 取自当前用户） |

**管理员判定**：数据模型当前无角色字段，故用「管理员邮箱白名单」做最小网关——
`authenticate` 后调用 `container.isAdminEmail(user.email)`，非白名单抛 `ForbiddenError`（router 映射 **403**），与既有越权 403 约定一致。白名单来源：`createContainer(prisma, { adminEmails })` 显式传入，或环境变量 `ADMIN_EMAILS`。

## 三、ContentIssue 状态机说明

严格线性，禁止跳变（`canTransitionIssue`）：

```
pending ──► reviewing ──► accepted
                  │
                  └──────► rejected
```

- `pending → reviewing`：标记审核中。
- `reviewing → accepted` / `reviewing → rejected`：二选一终态。
- **禁止** `pending → accepted/rejected` 直通（必须先 reviewing）。
- `accepted` / `rejected` 为终态，无任何出边。
- 非法迁移抛 `InvalidStateTransitionError`（HTTP 映射 409）。

## 四、事务边界说明

`ReviewContentIssue.execute` 整体包在**唯一一个** `uow.transaction(async () => { ... })` 内：

- accept 分支在该事务内依次完成：
  1. ContentItem `published → review`（复用 `canTransitionContent` 守卫）；
  2. 新建 ContentVersion（`version` 自增，**必须落 `sourceId` / `contentHash`**，BR-081 可追溯；`contentHash` 为空抛 `ValidationError`）；
  3. ContentItem `review → published`（`canTransitionContent` 守卫）；
  4. Issue → `accepted`，落 `reviewerId` / `resolution`。
- 任一步抛错 → Prisma `$transaction` 整体回滚（已由真实 SQLite 集成测试验证：版本落库处注入失败后，ContentItem 仍 published、Issue 仍 pending、无版本）。

**为什么不直接组合 ReviseContent / CreateContentVersion / PublishContent 三个既有用例**：它们各自内部会再开一层 `uow.transaction`，在 SQLite 单写者下会形成嵌套交互式事务冲突。本用例在唯一一层事务内复用同一组仓储与同名状态机守卫，语义完全一致，同时保证 Issue 与 ContentItem/ContentVersion 真正共享同一物理事务。

**幂等**：Issue 已是 `accepted` / `rejected` 时，直接原样返回 `{ idempotent: true }`，不重复建草稿、不重复生成 ContentVersion（重复 accept 不会产生第二个版本）。

## 五、测试与验证结果（实际跑出的数字）

### 新增测试（30 个）
- `src/tests/unit/content-issue-governance.test.ts`（24 个）：
  - `canTransitionIssue` 全量 (from,to) 矩阵（含 `it.each`）；
  - accept 全链路、重复 accept 幂等（只一个版本）、reject 路径、缺 contentHash 校验、修订非 published 内容守卫、issue 不存在。
- `src/tests/integration/content-issue-review.test.ts`（4 个，真实 SQLite + PrismaUnitOfWork）：
  - accept 全链路落库（新版本带 sourceId/contentHash）；
  - 重复 accept 幂等（真实库仍一个版本）；
  - 中途注入失败整体回滚；
  - reject 路径。
- `src/tests/integration/content-issue-http.test.ts`（2 个，真实 node:http + fetch）：
  - 上报→审核列表→接受→幂等逐端点断言；
  - 无 token 401 / 非管理员 403。

### 全量验证
- `npm run typecheck`（`tsc --noEmit`）：**0 错误**。
- `npm test`（vitest run）：**30 个测试文件，365 个测试全部通过**（原 27 文件 335 基线保持全绿 + 新增 3 文件 30 个测试）。
  - 注：曾观察到一次并行 worker 抢占同一 SQLite 文件导致 `api-http-loop` 两条越权 403 偶发抖动；该文件单独运行稳定通过，复跑全量后连续两轮 365 全绿，属既有并行 SQLite 争用的环境性抖动，非本次改动引入。

## 六、改动文件清单

新增：
- `src/modules/governance/application/review-content-issue.ts`
- `src/server/routes/governance-handlers.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/admin.css`
- `src/tests/unit/content-issue-governance.test.ts`
- `src/tests/integration/content-issue-review.test.ts`
- `src/tests/integration/content-issue-http.test.ts`
- `Phase12-完成报告.md`

修改：
- `src/modules/governance/domain/content-issue.ts`（+`canTransitionIssue` / `CONTENT_ISSUE_TYPES`）
- `src/server/container.ts`（装配治理仓储与用例 + 管理员邮箱白名单）
- `src/server/index.ts`（注册三条路由）

## 七、剩余缺口 / 后续建议

1. **管理员模型**：当前用邮箱白名单（环境变量 `ADMIN_EMAILS`）做最小网关；后续应在 User/Profile 增加 `role` / `isAdmin` 字段并迁移，替换白名单。
2. **审核工作台读模型**：列表仅按单状态 `findByStatus`（默认 pending），未做分页/搜索/报告人展示名；管理端页面对报告人只显示 id。
3. **accept 修订内容**：当前只落版本快照（sourceId/contentHash），未真正编辑正文（Formula/Herb 扩展表）；正文编辑属后续内容编辑能力。
4. **管理端入口**：`/admin` 页面独立于 `(app)` 布局壳，未挂主侧栏导航；「我的」页的「内容纠错记录」入口仍是只读占位，未接 `POST /api/content-issues` 上报表单。
5. **重试/并发审核**：同一 Issue 被两人同时审核时依赖事务隔离与终态幂等，未额外加乐观锁/唯一约束。
