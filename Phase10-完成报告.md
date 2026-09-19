# Phase 10 —— 前端（Frontend）完成报告

> 日期：2026-09-18　范围：在 Phase 0–9 已完成的 node:http + Prisma 后端之上，落地可本地运行的全栈前端。
> 基线：Phase 8-9 交付 20 个端点 + 335 个测试全绿。本阶段结束时 **tsc 0 错误、335/335 测试通过、Next.js 生产构建通过、学习主链路经真实 HTTP 端到端跑通**。

---

## 1. 技术选型决策及理由

### 1.1 Web 框架：Next.js 15（App Router）+ React 19

**决策**：采用 Next.js 15.5（App Router），React 19。

**理由**（均为代码库既有信号，非新引入偏好）：
- `package.json` 的 `dev/build/start` 脚本在 Phase 0-9 阶段就已预埋为 `next dev -p 3001 / next build / next start`；
- `src/app/(app)`、`(auth)`、`admin` 路由组空目录已预先搭好；
- `src/server/router.ts` 文件头注释即写明"框架无关、Next.js App Router handler 的本地适配器"，所有 handler 用标准 Web `Request/Response` 签名，与 Next.js Route Handler 完全对齐；
- `.env` 已含 `NEXTAUTH_URL=http://localhost:3001`。

### 1.2 API 挂载方式：catch-all 整体复用，零改动后端

**决策**：用 `src/app/api/[[...slug]]/route.ts` 一个 catch-all，把既有 `buildRouter()` 产出的 `ApiRouter.dispatch(req)` 整体接入，导出 GET/POST/PUT/PATCH/DELETE 五个 method。

**理由**：
- 20 个端点、全部 handler、全部领域用例一行未动；
- 335 个测试不感知前端框架，零回归；
- 不把 20 个端点逐个翻译成 Next.js 路由文件，避免双份维护。

### 1.3 本地数据库：SQLite（dev.db），不依赖 PostgreSQL

**决策**：本地运行用独立 SQLite 库 `prisma/dev.db`，由 `prisma/schema.dev.prisma`（SQLite 变体）建表，前端经 `src/server/generated/prisma-dev` 客户端取数。

**理由**：
- 本机 PostgreSQL 服务无权限启动（`net start` 返回 Access denied），生产 PG 不可用；
- Phase 7-9 的集成测试早已用 SQLite 证明了同一套模型/用例可跑；
- 种子数据来自 `data/published/{formula,acupoint,herb}.json`（259 首方剂、132 个腧穴，1696 个知识点），是真实管线产物，不是演示假数据。

> 注：生产部署时把 `.env` 的 `DATABASE_URL` 切回 postgresql、并让 `get-server-container.ts` 走 `createContainer()` 即可，本阶段不涉及线上部署。

---

## 2. 页面清单与端点对接映射

路由组 `src/app/(app)/`（受保护壳已含登录守卫 + 顶栏 + 侧栏/底部导航 + 夜间模式）：

| 页面 | 路径 | 对接端点 |
|---|---|---|
| 登录 | `(auth)/login` | `POST /api/auth/login` |
| 注册 | `(auth)/register` | `POST /api/auth/register` → 自动再调 login |
| 首页 | `(app)/page` | `GET /api/subjects`；`POST /api/study-plans/generate` + `GET /api/study-plans/today`（今日任务）；`GET /api/progress?subjectId=`（三科目进度环、薄弱点、累计复习） |
| 学习 | `(app)/learn` | `POST /api/sessions` → `POST /api/sessions/:id/items` → `POST /api/sessions/:id/items/:itemId/question` → `POST /api/attempts` → `POST /api/attempts/:id/review` |
| 复习 | `(app)/review` | `GET /api/progress/due`、`GET /api/progress/weaknesses`（due/weak/wrong 三 tab）→ 建 review session 跳 `/learn` |
| 内容 | `(app)/content` | `GET /api/subjects`；`GET /api/content?subjectId=`；`GET /api/content/:id` + `GET /api/content/:id/knowledge-points`（详情弹层） |
| 进度 | `(app)/progress` | `GET /api/progress?subjectId=`（覆盖环/复习数/到期/薄弱/稳定性分布） |
| 我的 | `(app)/profile` | `GET /api/me`；`GET /api/subjects`（只读偏好） |

**学习主链路状态机**：`选科目 → 开 Session → 取题（free_recall/fill_blank/recognition 三分支渲染）→ 作答 → 对答案 → Again/Hard/Good/Easy 评级 → 下一题 → 完成页`。题型按 KP 类型轮转，模板缺失自动回退 free_recall。

**依赖规则落实**：所有页面只通过 `src/lib/api-client.ts`（同源 fetch + Bearer 注入）打 `/api`；页面层无一处 import Prisma / FSRS / LearningState；`(app)/layout.tsx`、`globals.css`、`api-client`、`auth` provider 为共享基座，业务页只追加并列 CSS。

---

## 3. 测试与验证结果

| 验证项 | 结果 |
|---|---|
| `npx tsc --noEmit` | **0 错误**（修复了 seed-dev.ts 的 `noUncheckedIndexedAccess` 后） |
| `npx vitest run` | **27 文件 / 335 测试全部通过**，与 Phase 8-9 基线一致，无回归 |
| `npx next build` | 成功，11 条路由编译（含 catch-all API 动态路由），First Load JS ~103 kB 共享 |
| 页面可达性 | `/login /register / /learn /review /content /progress /profile` 全部 HTTP 200 |
| 端到端冒烟（`scripts/smoke-e2e.ps1`） | 注册→登录→subjects→生成计划→开 Session→取题（`复述：麻黄汤·组成`）→提交 Attempt→评级→进度（learned=1/1036, reviewedCount=1）**全链路通过** |

**种子数据**：3 科目 / 391 内容项（方剂 259、腧穴 132、中药 0——published/herb.json 为空数组）/ 1696 知识点 / 18 条 QuestionTemplate（9 个 KP 类型 × free_recall/recognition）。幂等可重复执行。

**本地一条命令起服**：
```powershell
npm run db:dev:push     # 首次建表
npm run db:dev:seed     # 灌真实数据
npm run dev             # http://localhost:3001
```

---

## 4. 剩余缺口（诚实记录）

1. **`dueList/weakList/错题`只读模型不带知识点标题**：后端只返回 `knowledgePointId`，前端按要求展示稳定编号，未编造标题。如需友好标题，需后端加一个批量 KP 读口。
2. **学习目标 / 科目偏好开关 / 通知**：后端无对应读写端点，前端以只读或"即将上线"态呈现，未伪造 API。
3. **连续学习热力日历**：后端无逐日 StudyDay 暴露端点，首页/进度用 `reviewedCount` + 稳定性分布做克制概览，未伪造日历格。
4. **中药（herb）科目为空**：`data/published/herb.json` 是空数组，前端 tab 可切换但列表为空，待数据管线补全。
5. **生产部署**：本阶段按要求只交付本地可运行一体工程；PostgreSQL 切换、环境变量、线上发布留待后续阶段。
6. **QuestionTemplate 仅建 free_recall + recognition**：fill_blank 依赖分隔符配置，未建模板，前端题型轮转到它会自动回退 free_recall；三分支渲染逻辑已就绪，补齐配置即可用。
