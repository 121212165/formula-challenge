"use client";

/**
 * 受保护布局壳 —— 登录后业务页面共用。
 *
 *  - useAuth 守卫：未登录（且水合完成）→ 跳转 /login；
 *  - 顶栏：品牌 + 夜间模式切换 + 用户 chip + 退出登录；
 *  - 桌面侧栏（6 项：首页/学习/复习/内容/进度/我的）；
 *  - 移动端底部导航（5 项：首页/学习/复习/内容/进度，对齐原型）；
 *  - 夜间模式：读写 localStorage('fc-theme') 并切换 html[data-theme]。
 *
 * 业务子路由（/learn /review /content /progress /profile）由后续 Phase 10 页面填充，
 * 这里只负责壳与导航。
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api-client";

/* ===== 导航项定义（图标内联 SVG，对齐原型 stroke 风格） ===== */
interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
} as const;

const NAV: NavItem[] = [
  {
    href: "/",
    label: "首页",
    icon: (
      <svg {...iconProps}><path d="M3 11.5 12 4l9 7.5M5 10v9h5v-6h4v6h5v-9" /></svg>
    ),
  },
  {
    href: "/learn",
    label: "学习",
    icon: (
      <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    ),
  },
  {
    href: "/review",
    label: "复习",
    icon: (
      <svg {...iconProps}>
        <path d="M4 5h16M4 12h10M4 19h7" />
        <circle cx="20" cy="17" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/content",
    label: "内容",
    icon: (
      <svg {...iconProps}>
        <path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14" />
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "进度",
    icon: <svg {...iconProps}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>,
  },
  {
    href: "/profile",
    label: "我的",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
];

// 底部导航：5 项（不含"我的"，对齐原型 bottom-nav）
const BOTTOM_NAV_HREFS = ["/", "/learn", "/review", "/content", "/progress"];

const ICON_MOON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 15, height: 15 }}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const ICON_SUN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 15, height: 15 }}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H2M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
  </svg>
);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 守卫：水合完成且未登录 → 强制跳登录
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  // 挂载后读取当前主题（防闪烁脚本已在首帧设好，这里只同步按钮图标）
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("fc-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // 尽力撤销服务端会话；失败也不阻塞本地退出
      await api.post("/api/auth/logout").catch(() => undefined);
    } finally {
      logout();
      router.replace("/login");
    }
  }

  // 水合中：轻量占位，避免未登录时闪现受保护内容
  if (loading || !session) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="muted" style={{ color: "var(--ink-faint)" }}>
          加载中…
        </div>
      </div>
    );
  }

  const initial = (session.user.name || session.user.email || "?").slice(0, 1);

  return (
    <>
      {/* 顶栏 */}
      <header className="topbar">
        <div className="brand">
          <div className="seal">方</div>
          <div>
            formula-challenge
            <small>V2 · 中医知识记忆系统</small>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-text"
            onClick={toggleTheme}
            title={dark ? "切换日间模式" : "切换夜间模式"}
            aria-label="切换夜间模式"
          >
            {dark ? ICON_SUN : ICON_MOON}
          </button>
          <div className="user-chip">
            <span className="avatar">{initial}</span>
            <span>{session.user.name || session.user.email}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            退出
          </button>
        </div>
      </header>

      <div className="app">
        {/* 桌面侧栏 */}
        <aside className="sidebar">
          <div className="side-label">学习</div>
          {NAV.slice(0, 3).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-item" + (isActive(pathname, item.href) ? " active" : "")}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <div className="side-label">知识库</div>
          <Link
            href="/content"
            className={"nav-item" + (isActive(pathname, "/content") ? " active" : "")}
          >
            {NAV.find((n) => n.href === "/content")!.icon}
            内容
          </Link>
          <div className="side-label">成长</div>
          <Link
            href="/progress"
            className={"nav-item" + (isActive(pathname, "/progress") ? " active" : "")}
          >
            {NAV.find((n) => n.href === "/progress")!.icon}
            进度
          </Link>
          <Link
            href="/profile"
            className={"nav-item" + (isActive(pathname, "/profile") ? " active" : "")}
          >
            {NAV.find((n) => n.href === "/profile")!.icon}
            我的
          </Link>
        </aside>

        <main className="main">{children}</main>
      </div>

      {/* 移动端底部导航（≤900px） */}
      <nav className="bottom-nav">
        {NAV.filter((n) => BOTTOM_NAV_HREFS.includes(n.href)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={"bn-item" + (isActive(pathname, item.href) ? " active" : "")}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
