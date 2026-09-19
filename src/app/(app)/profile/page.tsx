"use client";

/**
 * 我的页（受保护业务页）—— 对齐原型 profile 视图。
 *
 * 数据全部经 api-client 打 /api：
 *   GET /api/me         → 当前用户（email / name / timezone / createdAt）
 *   GET /api/subjects   → enabled 科目列表（只读展示科目偏好）
 *
 * 没有后端读写端点的项（学习目标、科目偏好开关、通知、导出/纠错/设备）
 * 一律以"只读 / 即将上线"卡片呈现，不伪造 API 调用。
 * 数据安全区为静态说明（token 存 localStorage、退出即清除等）。
 */
import { useEffect, useState } from "react";
import { api, ApiError, type AuthUser } from "@/lib/api-client";
import "./profile.css";

interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
}

/** 注册时间格式化 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [meRes, subjRes] = await Promise.all([
          api.get<{ user: AuthUser }>("/api/me"),
          api.get<{ subjects: Subject[] }>("/api/subjects").catch(() => ({
            subjects: [] as Subject[],
          })),
        ]);
        if (cancelled) return;
        setUser(meRes.user);
        setSubjects(subjRes.subjects);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "资料加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="eyebrow">账户</div>
            <h1>我的</h1>
          </div>
        </div>
        <div className="profile-loading">资料加载中…</div>
      </div>
    );
  }

  const displayName = user?.name || user?.email?.split("@")[0] || "同学";
  const initial = displayName.slice(0, 1);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">账户</div>
          <h1>我的</h1>
          <div className="sub">学习档案 · 偏好 · 安全</div>
        </div>
      </div>

      {error && <div className="profile-error">{error}</div>}

      <div className="profile-grid">
        {/* 左侧账户卡 */}
        <div className="card profile-card">
          <div className="avatar-lg">{initial}</div>
          <div className="pc-name">{displayName}</div>
          <div className="pc-email">{user?.email ?? "-"}</div>
          <div className="pc-pills">
            <span className="pill pill-cin">{user?.timezone ?? "本地时区"}</span>
            <span className="pill pill-gold">
              {user?.emailVerifiedAt ? "已验证" : "未验证"}
            </span>
          </div>
          <div className="pc-actions">
            <button type="button" className="btn btn-ghost" disabled title="后续阶段开放">
              编辑资料
              <span className="soon-badge">即将上线</span>
            </button>
            <button type="button" className="btn btn-ghost" disabled title="后续阶段开放">
              修改密码
              <span className="soon-badge">即将上线</span>
            </button>
          </div>
        </div>

        {/* 右侧信息 / 设置区 */}
        <div>
          {/* 账户信息 */}
          <div className="card">
            <h3>账户信息</h3>
            <div className="info-row">
              <span className="k">邮箱</span>
              <span className="v">{user?.email ?? "-"}</span>
            </div>
            <div className="info-row">
              <span className="k">昵称</span>
              <span className="v">{user?.name ?? "未设置"}</span>
            </div>
            <div className="info-row">
              <span className="k">时区</span>
              <span className="v">{user?.timezone ?? "-"}</span>
            </div>
            <div className="info-row">
              <span className="k">注册时间</span>
              <span className="v">{formatDate(user?.createdAt)}</span>
            </div>
            <div className="info-row">
              <span className="k">邮箱验证</span>
              <span className="v">
                {user?.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "未验证"}
              </span>
            </div>
          </div>

          {/* 学习目标（无后端端点 → 只读占位） */}
          <div className="card mt16">
            <h3>
              学习目标
              <span className="soon-badge">后续阶段开放</span>
            </h3>
            <div className="setting-row">
              <span>每日学习时长</span>
              <select className="select-box" disabled defaultValue="60">
                <option value="30">30 分钟</option>
                <option value="60">60 分钟</option>
                <option value="90">90 分钟</option>
              </select>
            </div>
            <div className="setting-row">
              <span>每日新知识点数</span>
              <select className="select-box" disabled defaultValue="10">
                <option value="5">5 个</option>
                <option value="10">10 个</option>
                <option value="20">20 个</option>
              </select>
            </div>
            <div className="setting-row">
              <span>学习阶段</span>
              <select className="select-box" disabled defaultValue="exam">
                <option value="beginner">初学</option>
                <option value="intermediate">进阶</option>
                <option value="sprint">备考冲刺</option>
                <option value="exam">考试模式</option>
              </select>
            </div>
            <div className="muted mt8">
              这些偏好将通过后续 /api/me 扩展读写端点接入，当前仅作只读展示。
            </div>
          </div>

          {/* 科目偏好（GET /api/subjects 只读） */}
          <div className="card mt16">
            <h3>科目偏好</h3>
            {subjects.length === 0 ? (
              <div className="empty">暂无可读科目</div>
            ) : (
              subjects.map((s) => (
                <div className="setting-row" key={s.id}>
                  <span>
                    {s.name}
                    <span className="sr-note"> · {s.code}</span>
                  </span>
                  <div className="switch on disabled" title="已启用（只读）" />
                </div>
              ))
            )}
            <div className="muted mt8">
              当前只读展示 enabled 科目；开关能力将随用户偏好端点开放。
            </div>
          </div>

          {/* 通知（无后端端点 → 只读占位） */}
          <div className="card mt16">
            <h3>
              通知与提醒
              <span className="soon-badge">后续阶段开放</span>
            </h3>
            <div className="setting-row">
              <span>每日学习提醒</span>
              <div className="switch disabled" title="后续阶段开放" />
            </div>
            <div className="setting-row">
              <span>到期复习提醒</span>
              <div className="switch disabled" title="后续阶段开放" />
            </div>
            <div className="setting-row">
              <span>新内容发布通知</span>
              <div className="switch disabled" title="后续阶段开放" />
            </div>
          </div>

          {/* 数据与安全（静态说明） */}
          <div className="card mt16">
            <h3>数据与安全</h3>
            <div className="safety-note">
              <b>会话存储：</b>登录令牌仅保存在浏览器 localStorage（键
              <code> fc-auth </code>），不写入 cookie；退出登录即从本地清除。
            </div>
            <div className="safety-note">
              <b>传输：</b>所有业务请求走同源 <code>/api</code>，鉴权使用
              <code> Authorization: Bearer &lt;token&gt; </code>头。
            </div>
            <div className="safety-note">
              <b>数据导出 / 纠错记录 / 设备管理：</b>尚未提供后端读写端点，
              后续阶段开放；当前请勿在本页演示这些操作。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
