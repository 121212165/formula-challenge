/**
 * 浏览器端 API 客户端 —— 封装 fetch，统一鉴权与错误处理。
 *
 *  - base 同源（''），请求路径直接写 "/api/..."；
 *  - 每次自动从 localStorage 读 token，附加 Authorization: Bearer <token>；
 *  - 统一 JSON 解析；非 2xx 抛错（后端错误体为 { error: { code, message } }）。
 *
 * 仅在浏览器（Client Component）中使用；不在服务端组件里 import。
 */

const AUTH_STORAGE_KEY = "fc-auth";

/** 读取本地保存的会话 token（无则 null）。 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

/** 业务错误：带后端 code，便于界面区分 401/422/409 等。 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** 不自动带 token（如登录/注册本身） */
  auth?: boolean;
}

/** 核心请求函数。 */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // 同源，无需 credentials: 'include'（会话走 Bearer token）
    });
  } catch (e) {
    throw new ApiError(0, "NETWORK", "网络异常，请检查连接");
  }

  // 204 / 空体
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errBody = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      errBody?.code ?? "HTTP_ERROR",
      errBody?.message ?? `请求失败（${res.status}）`
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown, opts: { auth?: boolean } = {}) =>
    request<T>(path, { method: "POST", body, auth: opts.auth ?? true }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** 登录/注册响应类型（与后端 handler 对齐）。 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
  sessionExpiresAt: string;
}

export { AUTH_STORAGE_KEY };
