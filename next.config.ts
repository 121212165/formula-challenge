import type { NextConfig } from "next";

// 安全响应头(2026-08 安全审查修复)
// 注意:Next.js App Router 依赖内联 script/style,CSP 需放行 'unsafe-inline'/'unsafe-eval'
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // 保留 microphone(语音背诵检测 ASR 功能需要),禁用相机/定位/支付
    value: "camera=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.deepseek.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 不在响应头暴露框架版本(移除 X-Powered-By: Next.js)
  poweredByHeader: false,
  // 允许 Postgres 等 Node 模块在 server 端使用
  serverExternalPackages: ["@prisma/client", "ts-fsrs"],
  // 测试时关闭 ESLint 阻塞
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
