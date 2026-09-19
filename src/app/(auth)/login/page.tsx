"use client";

/**
 * 登录页 —— 对齐原型登录视图。
 *
 *  POST /api/auth/login { email, password }
 *   → 200 { user, token, sessionExpiresAt }
 *   → 存 { token, user } 到 localStorage（经 useAuth.login）→ 跳首页 /
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, type LoginResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post<LoginResponse>(
        "/api/auth/login",
        { email, password },
        { auth: false }
      );
      login({ token: res.token, user: res.user });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">方</div>
      <h1>欢迎回来</h1>
      <p className="auth-sub">继续你的中医记忆之旅</p>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="lg-email">邮箱</label>
          <input
            id="lg-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="lg-pass">密码</label>
          <input
            id="lg-pass"
            type="password"
            autoComplete="current-password"
            placeholder="至少 8 位"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="field-error">{error}</div>}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "11px" }}
          disabled={submitting}
        >
          {submitting ? "登录中…" : "登 录"}
        </button>
        <div className="auth-switch">
          还没有账号？<Link href="/register">立即注册</Link>
        </div>
        <div className="auth-alt">忘记密码？演示环境直接注册新账号即可</div>
      </form>

      <div className="auth-alt">V2 · 中医知识记忆系统</div>
    </div>
  );
}
