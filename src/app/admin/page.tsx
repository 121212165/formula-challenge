"use client";

/**
 * 内容审核工作台（Phase 12 最小管理端）。
 *
 *  - 列出待审 ContentIssue（默认 pending，可切 status 过滤）；
 *  - 每条展示 类型 / 描述 / 内容项 / 报告人 / 时间；
 *  - 「接受」展开行内表单：必填 contentHash（修订后内容指纹），可选 sourceId/resolution，
 *    提交 POST /api/admin/content-issues/:id/review?decision=accept；
 *  - 「拒绝」提交 decision=reject（可选 resolution）。
 *
 * 风格对齐 Phase 10：复用 globals.css 的宣纸/墨/朱砂/草本/金 token 与卡片/按钮/胶囊基元，
 * 夜间模式由根布局 html[data-theme] 变量自动接管。非管理员打开时后端返回 403，本页给出提示。
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import "./admin.css";

type IssueStatus = "pending" | "reviewing" | "accepted" | "rejected";

interface ContentIssueView {
  id: string;
  reporterId: string;
  contentItemId: string;
  knowledgePointId: string | null;
  type: string;
  description: string;
  status: IssueStatus;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TABS: IssueStatus[] = ["pending", "reviewing", "accepted", "rejected"];

const TYPE_LABEL: Record<string, string> = {
  incorrect: "内容有误",
  missing: "内容缺失",
  unclear: "表述不清",
  source: "出处问题",
  other: "其它",
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  pending: "待审",
  reviewing: "审核中",
  accepted: "已通过",
  rejected: "已驳回",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminContentIssuesPage() {
  const [status, setStatus] = useState<IssueStatus>("pending");
  const [issues, setIssues] = useState<ContentIssueView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  // 正在展开 accept 行内表单的 issue id
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hash, setHash] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [acceptResolution, setAcceptResolution] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (s: IssueStatus) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ issues: ContentIssueView[] }>(
        `/api/admin/content-issues?status=${s}`
      );
      setIssues(res.issues);
      setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
      } else {
        setError(e instanceof ApiError ? e.message : "审核列表加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  async function review(issueId: string, decision: "accept" | "reject") {
    setBusy(issueId);
    try {
      if (decision === "accept") {
        if (!hash.trim()) {
          setError("接受修订必须填写 contentHash");
          return;
        }
        await api.post(`/api/admin/content-issues/${issueId}/review`, {
          decision: "accept",
          contentHash: hash.trim(),
          sourceId: sourceId.trim() || undefined,
          resolution: acceptResolution.trim() || undefined,
        });
        setExpanded(null);
        setHash("");
        setSourceId("");
        setAcceptResolution("");
      } else {
        await api.post(`/api/admin/content-issues/${issueId}/review`, {
          decision: "reject",
          resolution: acceptResolution.trim() || undefined,
        });
      }
      await load(status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="brand">
          <div className="seal">审</div>
          <div>
            内容治理工作台
            <small>PHASE 12 · CONTENT GOVERNANCE</small>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="page-head">
          <div>
            <div className="eyebrow">内容可信度守护</div>
            <h1>内容问题审核</h1>
            <div className="sub">用户报告 → 审核 → 修订留痕（BR-080/081/082）</div>
          </div>
        </div>

        {forbidden && (
          <div className="admin-error">
            无访问权限：当前账户不是内容审核管理员。
          </div>
        )}
        {error && <div className="admin-error">{error}</div>}

        {!forbidden && (
          <>
            <div className="admin-tabs">
              {STATUS_TABS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={"admin-tab" + (s === status ? " active" : "")}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="empty">加载中…</div>
            ) : issues.length === 0 ? (
              <div className="empty">暂无「{STATUS_LABEL[status]}」状态的问题报告</div>
            ) : (
              <div className="grid">
                {issues.map((issue) => (
                  <div className="card admin-card" key={issue.id}>
                    <div className="admin-card-head">
                      <span className="pill pill-cin">{TYPE_LABEL[issue.type] ?? issue.type}</span>
                      <span className="pill pill-line">{STATUS_LABEL[issue.status]}</span>
                      <span className="admin-time">{formatTime(issue.createdAt)}</span>
                    </div>
                    <div className="admin-desc">{issue.description}</div>
                    <div className="admin-meta">
                      内容项 <code>{issue.contentItemId}</code>
                      {issue.knowledgePointId && (
                        <>
                          {" · "}知识点 <code>{issue.knowledgePointId}</code>
                        </>
                      )}
                      {" · "}报告人 <code>{issue.reporterId}</code>
                    </div>

                    {(issue.status === "pending" || issue.status === "reviewing") && (
                      <div className="admin-actions">
                        {expanded !== issue.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy === issue.id}
                              onClick={() => {
                                setExpanded(issue.id);
                                setHash("");
                                setSourceId("");
                                setAcceptResolution("");
                              }}
                            >
                              接受并修订
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy === issue.id}
                              onClick={() => review(issue.id, "reject")}
                            >
                              拒绝
                            </button>
                          </>
                        ) : (
                          <div className="admin-accept-form">
                            <label className="admin-field">
                              <span>contentHash（必填，修订后内容指纹）</span>
                              <input
                                value={hash}
                                onChange={(e) => setHash(e.target.value)}
                                placeholder="如 sha256:..."
                              />
                            </label>
                            <label className="admin-field">
                              <span>sourceId（可选，修订依据出处）</span>
                              <input
                                value={sourceId}
                                onChange={(e) => setSourceId(e.target.value)}
                                placeholder="内容来源 id"
                              />
                            </label>
                            <label className="admin-field">
                              <span>审核说明（可选）</span>
                              <input
                                value={acceptResolution}
                                onChange={(e) => setAcceptResolution(e.target.value)}
                                placeholder="修订摘要 / 拒绝理由"
                              />
                            </label>
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy === issue.id}
                                onClick={() => review(issue.id, "accept")}
                              >
                                确认接受
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy === issue.id}
                                onClick={() => setExpanded(null)}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {issue.resolution && (
                      <div className="admin-resolution">审核结论：{issue.resolution}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
