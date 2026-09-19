/**
 * Next.js 15 App Router 配置（Phase 10 前端基础层）。
 *
 * 要点：
 *  - images.unoptimized：本地/standalone 部署不启用 Next 图片优化。
 *  - serverExternalPackages：Prisma 运行时（含原生 query engine）不被 webpack 打包，
 *    保持 Node require 加载，避免 .node / wasm 被误打包。
 *  - @/* 别名沿用 tsconfig paths（指向 src/*），无需在此重复配置。
 */
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 关闭 Next 内置图片优化
  images: {
    unoptimized: true,
  },
  // 服务端外部化：Prisma 及其生成客户端按 Node 原生方式加载
  serverExternalPackages: ["@prisma/client", ".prisma"],
  // 构建期不阻塞于 lint（本阶段未接入 ESLint 配置）
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 类型错误照常报错（不绕过）
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // 服务端：把并行代理生成的本地 SQLite dev client 标记为外部，
    // 运行时直接 require（按绝对路径解析），避免 webpack 尝试打包其原生引擎
    // （.node / .wasm）。注意：必须解析成绝对路径，否则产物在 .next/server 下
    // 按相对路径 require 会 MODULE_NOT_FOUND。
    if (isServer) {
      const externals: Array<
        | string
        | ((ctx: { context?: string; request?: string }, cb: (err?: Error, res?: string) => void) => void)
      > = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      externals.push((ctx, cb) => {
        const req = ctx.request ?? "";
        if (req.includes("generated/prisma-dev")) {
          const base = ctx.context ?? process.cwd();
          const abs = path.resolve(base, req);
          return cb(undefined, "commonjs " + abs);
        }
        cb();
      });
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
