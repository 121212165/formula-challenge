# 方剂口诀闯关（Formula Challenge）

中医方剂、中药、腧穴记忆闯关 Web 应用。通过「学习 → 闯关 → 背诵」三模式 + FSRS 间隔重复算法 + AI 个性化每日计划，帮助中医学习者高效记忆方剂歌诀。

## 功能特性

- **三大科目**：方剂（200+ 首）、中药（300+ 味）、腧穴（150+ 个），各自独立的知识点与闯关体系
- **三种学习模式**：逐句遮罩学习、闯关答题（药物组成 / 方歌 / 功用主治）、背诵检测
- **语音背诵检测**：浏览器端 ASR 语音识别，自动比对背诵内容
- **FSRS 间隔重复**：基于 ts-fsrs 4.x 的记忆调度引擎，自动安排复习计划
- **AI 每日计划**：接入 DeepSeek / StepFun 大模型，生成个性化学习计划；未配置 AI 时自动降级为规则推荐
- **AI 问答助手**：基于上下文的学习答疑（带内容安全过滤）
- **用户体系**：邮箱注册 / 登录（bcrypt + JWT 会话）、学习统计、连续打卡、错题本
- **众包纠错**：用户可标记错误 / 提交修正建议，后台审核后合入主数据
- **安全加固**：登录限流、CSP / X-Frame-Options 等安全响应头、ISR + API 缓存

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 15（App Router）、React 19、TypeScript |
| 样式 | Tailwind CSS 4 + Radix UI（shadcn 风格组件） |
| 数据 | PostgreSQL + Prisma 6（Neon 兼容） |
| 认证 | NextAuth 4（Credentials + bcrypt） |
| 记忆算法 | ts-fsrs 4（FSRS-5） |
| LLM | DeepSeek / StepFun（OpenAI 兼容接口） |
| 测试 | Vitest + Testing Library |
| 部署 | Vercel（含 Cron 定时任务） |

## 快速开始

### 环境要求

- Node.js 18+ / Bun 1.x
- PostgreSQL 数据库（本地或 Neon）

### 安装与运行

```bash
# 1. 安装依赖
bun install   # 或 npm install

# 2. 配置环境变量
cp .env.example .env   # 按需填写

# 3. 同步数据库结构
bun run db:push

# 4. 导入种子数据
bun run db:seed

# 5. 启动开发服务器
bun run dev   # http://localhost:3000
```

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串（Prisma 主连接） |
| `DIRECT_URL` | 可选 | 直连串（Neon 连接池场景） |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 会话签名密钥 |
| `NEXTAUTH_URL` | ✅ | 站点地址，如 `http://localhost:3000` |
| `DEEPSEEK_API_KEY` | 可选 | DeepSeek API 密钥（与 StepFun 二选一） |
| `STEP_API_KEY` | 可选 | StepFun API 密钥（配置后优先） |
| `STEP_BASE_URL` / `STEP_MODEL` | 可选 | StepFun 接口地址与模型名 |
| `CRON_SECRET` | 可选 | Vercel Cron / 缓存失效接口鉴权密钥 |
| `ADMIN_EMAILS` | 可选 | 后台审核管理员邮箱，逗号分隔 |

> 提示：AI 相关密钥均通过 `process.env` 读取，切勿写入代码或提交到仓库。

## 测试

```bash
bun run test        # 单元测试（Vitest）
bun run lint        # ESLint
bun run typecheck   # TypeScript 类型检查
```

## 部署（Vercel）

1. 导入仓库，框架自动识别为 Next.js
2. 在 Project Settings → Environment Variables 中配置上述环境变量
3. 部署后按需配置 Cron Job（见 `vercel.json`，每日 19:00 UTC 预生成学习计划）

## 项目结构

```
src/
├── app/
│   ├── api/            # Route Handlers（答题、计划、AI、反馈、后台审核等）
│   ├── formulas/       # 方剂详情页
│   ├── herbs/          # 中药列表 / 详情
│   ├── acupoints/      # 腧穴列表 / 详情
│   ├── categories/     # 分类浏览
│   ├── auth/           # 登录 / 注册
│   └── admin/          # 后台审核
├── components/         # UI 组件（学习、闯关、背诵、AI 问答等）
└── lib/                # 核心逻辑（FSRS、评分、AI 客户端、限流、鉴权等）
prisma/schema.prisma    # 数据模型（9 张表）
scripts/                # 数据扩充 / 种子脚本
tests/                  # 单元测试
```

## 数据来源

方剂、中药、腧穴数据整理自中医教材与公开口诀资料（详见 `data/` 目录及种子脚本），供学习交流使用；如引用请注明来源。

## License

本项目尚未指定开源协议，公开仅供学习交流。
