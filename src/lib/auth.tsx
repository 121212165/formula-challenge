"use client";

/**
 * 登录态 Provider（Client Component）。
 *
 *  - 登录成功后把 { token, user } 存入 localStorage（key: fc-auth）；
 *  - useAuth() 暴露 { user, token, login, logout, loading }；
 *  - 受保护布局壳（(app)/layout）据此守卫：未登录跳转 /login。
 *
 * 注意：SSR 阶段 localStorage 不可用，初始 loading=true，
 * 挂载后（useEffect）再从 localStorage 水合，避免水合不一致。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AUTH_STORAGE_KEY, type AuthUser } from "./api-client";

export interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  /** 已登录会话；未登录为 null */
  session: AuthSession | null;
  user: AuthUser | null;
  token: string | null;
  /** 首次水合完成前为 true（用于避免守卫闪烁跳登录） */
  loading: boolean;
  /** 写入会话并持久化 */
  login: (session: AuthSession) => void;
  /** 清除会话（调用后端 logout 由页面层处理） */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed && typeof parsed.token === "string" && parsed.user) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  // 挂载时从 localStorage 水合
  useEffect(() => {
    setSession(readStoredSession());
    setLoading(false);
  }, []);

  const login = useCallback((next: AuthSession) => {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下写入失败可忽略，内存态仍可用 */
    }
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      token: session?.token ?? null,
      loading,
      login,
      logout,
    }),
    [session, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 取登录态。必须在 AuthProvider 内使用。 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  return ctx;
}
