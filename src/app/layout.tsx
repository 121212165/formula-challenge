/**
 * 根布局 —— 所有路由共用。
 *
 *  - <html lang="zh-CN"> + <body>，引入 globals.css；
 *  - 注入 AuthProvider（登录态）；
 *  - <head> 内联一段防闪烁脚本：首帧前读 localStorage(fc-theme) 并设置
 *    html[data-theme]，避免夜间模式刷新时白屏闪烁（对齐原型 initTheme）。
 */
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "formula-challenge V2 · 中医知识记忆系统",
  description: "方剂 · 中药 · 腧穴，一次学懂，长期记住",
};

// 首帧前应用主题：读 localStorage('fc-theme')，缺省跟随系统偏好
const themeInitScript = `(function(){try{var v=localStorage.getItem('fc-theme');var dark=v?v==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
