"use client";

/**
 * 注册页 —— 对齐原型注册视图。
 *
 *  POST /api/auth/register { email, password, timezone, name }
 *   → 201 { user, verificationToken, ... }（注意：不签发会话 token）
 *  注册成功后自动用同一组凭据调 /api/auth/login 拿会话 token，
 *  存 { token, user } → 跳首页（即"注册即登录"）。
 *  timezone 取浏览器 IANA 标识（BR-093 后端必填）。
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, type LoginResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // 1) 注册
      await api.post(
        "/api/auth/register",
        { email, password, timezone, name: name || null },
        { auth: false }
      );
      // 2) 自动登录（注册接口不直接返回会话 token）
      const res = await api.post<LoginResponse>(
        "/api/auth/login",
        { email, password },
        { auth: false }
      );
      login({ token: res.token, user: res.user });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">方</div>
      <h1>加入 formula-challenge</h1>
      <p className="auth-sub">方剂 · 中药 · 腧穴，一次学懂，长期记住</p>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="rg-name">姓名</label>
          <input
            id="rg-name"
            placeholder="你的名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rg-email">邮箱</label>
          <input
            id="rg-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rg-pass">密码</label>
          <input
            id="rg-pass"
            type="password"
            autoComplete="new-password"
            placeholder="至少 8 位"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
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
          {submitting ? "创建中…" : "注册并开始"}
        </button>
        <div className="auth-switch">
          已有账号？<Link href="/login">直接登录</Link>
        </div>
      </form>

      <div className="auth-alt">V2 · 中医知识记忆系统</div>
    </div>
  );
}
