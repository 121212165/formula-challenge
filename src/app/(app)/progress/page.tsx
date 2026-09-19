"use client";

/**
 * 进度页（受保护业务页）—— 对齐原型 progress 视图。
 *
 * 数据全部经 api-client 打 /api：
 *   GET /api/subjects             → 顶部科目切换
 *   GET /api/progress?subjectId=X → 完整读模型（coverage / reviewedCount /
 *                                    dueList / weakList / stabilityDistribution）
 *
 * 呈现：
 *   - 顶部科目切换（默认 formula）；
 *   - 4 张数字卡：科目覆盖环形（SVG）、累计复习次数、到期项数、薄弱项数；
 *   - 三栏：到期复习列表（dueAt / stability）、薄弱点列表（reasons）、学习概览；
 *   - 底部：稳定性分布条形图（lt1day / d1to7days / d7to30days / gte30days）。
 *
 * 说明：后端无每日热力日历端点，这里用 reviewedCount 与 stabilityDistribution
 * 做"学习概览"卡，不伪造每天的热力数据。
 */
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import "./progress.css";

/* ===== 与 GetUserProgressResult 对齐的类型（JSON 后 Date → string） ===== */
interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface Coverage {
  subjectId: string;
  publishedTotal: number;
  learnedCount: number;
}

interface DueItem {
  knowledgePointId: string;
  dueAt: string; // ISO string
  stability: number;
}

type WeakReason =
  | { type: "again"; count: number }
  | { type: "lapse"; lapseCount: number }
  | { type: "low_stability"; stability: number };

interface WeakItem {
  knowledgePointId: string;
  reasons: WeakReason[];
}

interface StabilityDistribution {
  lt1day: number;
  d1to7days: number;
  d7to30days: number;
  gte30days: number;
  total: number;
}

interface ProgressResult {
  coverage: Coverage;
  reviewedCount: number;
  dueList: DueItem[];
  weakList: WeakItem[];
  stabilityDistribution: StabilityDistribution;
}

/** 覆盖率环形 SVG（r=38，对齐原型 ringSVG） */
function CoverageRing({ pct, color }: { pct: number; color: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width="104" height="104" viewBox="0 0 104 104">
      <circle cx="52" cy="52" r={r} fill="none" stroke="var(--paper-deep)" strokeWidth="10" />
      <circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 52 52)"
      />
    </svg>
  );
}

/** 格式化 ISO 时间 → 本地 yyyy-MM-dd HH:mm */
function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** 把 WeakReason 列表转成可读中文标签 */
function reasonLabel(r: WeakReason): string {
  if (r.type === "again") return `历史重答 ${r.count} 次`;
  if (r.type === "lapse") return `曾遗忘 ${r.lapseCount} 次`;
  return `稳定性 ${r.stability.toFixed(2)} 天`;
}

export default function ProgressPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState("");
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState("");

  const [progress, setProgress] = useState<ProgressResult | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");

  /* 拉科目列表 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSubjectsLoading(true);
      setSubjectsError("");
      try {
        const res = await api.get<{ subjects: Subject[] }>("/api/subjects");
        if (cancelled) return;
        setSubjects(res.subjects);
        const preferred =
          res.subjects.find((s) => s.code === "formula") ?? res.subjects[0];
        setActiveSubjectId(preferred ? preferred.id : "");
      } catch (e) {
        if (!cancelled) {
          setSubjectsError(e instanceof ApiError ? e.message : "科目加载失败");
        }
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 选中科目变化 → 拉进度读模型 */
  useEffect(() => {
    if (!activeSubjectId) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setProgressLoading(true);
      setProgressError("");
      try {
        const res = await api.get<ProgressResult>(
          `/api/progress?subjectId=${encodeURIComponent(activeSubjectId)}`
        );
        if (cancelled) return;
        setProgress(res);
      } catch (e) {
        if (!cancelled) {
          setProgressError(e instanceof ApiError ? e.message : "进度加载失败");
        }
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSubjectId]);

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;

  /* 覆盖率百分比 */
  const cov = progress?.coverage;
  const covPct =
    cov && cov.publishedTotal > 0
      ? Math.round((cov.learnedCount / cov.publishedTotal) * 100)
      : 0;

  /* 稳定性分布 → 柱状图数据（4 段） */
  const dist = progress?.stabilityDistribution;
  const bars: Array<{ label: string; value: number; color: string }> = [
    { label: "<1 天", value: dist?.lt1day ?? 0, color: "var(--cinnabar)" },
    { label: "1–7 天", value: dist?.d1to7days ?? 0, color: "var(--gold)" },
    { label: "7–30 天", value: dist?.d7to30days ?? 0, color: "var(--herb)" },
    { label: "≥30 天", value: dist?.gte30days ?? 0, color: "var(--ink)" },
  ];
  const maxBar = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">成长</div>
          <h1>学习进度</h1>
          <div className="sub">覆盖 · 复习 · 到期 · 薄弱 · 稳定性，五维分开呈现</div>
        </div>
      </div>

      {/* 顶部科目切换 */}
      <div className="tab-row">
        {subjectsLoading && <span className="muted">科目加载中…</span>}
        {!subjectsLoading &&
          subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className={"tab-pill" + (s.id === activeSubjectId ? " active" : "")}
              onClick={() => setActiveSubjectId(s.id)}
            >
              {s.name}
            </button>
          ))}
      </div>

      {subjectsError && <div className="progress-error">{subjectsError}</div>}
      {progressError && <div className="progress-error">{progressError}</div>}

      {progressLoading && !progress ? (
        <div className="progress-loading">进度加载中…</div>
      ) : progress ? (
        <>
          {/* 4 张数字卡 */}
          <div className="grid grid-4">
            <div className="card">
              <div className="ring-wrap">
                <CoverageRing pct={covPct} color="var(--cinnabar)" />
                <div className="ring-num">
                  <div className="n">{covPct}%</div>
                  <div className="l">知识点覆盖率</div>
                </div>
              </div>
              <div className="muted mt8" style={{ textAlign: "center" }}>
                {cov?.learnedCount ?? 0} / {cov?.publishedTotal ?? 0} 已学
              </div>
            </div>

            <div className="card">
              <div className="stat herb">
                <span className="num">{progress.reviewedCount}</span>
                <span className="lbl">累计复习次数</span>
              </div>
              <div className="muted mt8">每次 FinalizeReview 计 1 次</div>
            </div>

            <div className="card">
              <div className="stat cinnabar">
                <span className="num">{progress.dueList.length}</span>
                <span className="lbl">到期需复习</span>
              </div>
              <div className="muted mt8">dueAt ≤ 当前时间</div>
            </div>

            <div className="card">
              <div className="stat gold">
                <span className="num">{progress.weakList.length}</span>
                <span className="lbl">薄弱知识点</span>
              </div>
              <div className="muted mt8">重答 / 遗忘 / 低稳定性</div>
            </div>
          </div>

          {/* 三栏：到期 / 薄弱 / 学习概览 */}
          <div className="grid grid-3 mt16">
            <div className="card">
              <h3>到期复习</h3>
              <div className="muted" style={{ marginBottom: 6 }}>
                按 dueAt 升序，最多返回 200 条
              </div>
              {progress.dueList.length === 0 ? (
                <div className="empty">当前没有到期任务</div>
              ) : (
                progress.dueList.slice(0, 12).map((d) => (
                  <div className="list-row" key={d.knowledgePointId}>
                    <div className="grow">
                      <div className="kp-id">{d.knowledgePointId}</div>
                      <div className="desc">到期：{formatDue(d.dueAt)}</div>
                    </div>
                    <span className="pill pill-cin">
                      稳定 {d.stability.toFixed(1)} 天
                    </span>
                  </div>
                ))
              )}
              {progress.dueList.length > 12 && (
                <div className="muted mt8" style={{ textAlign: "right" }}>
                  …还有 {progress.dueList.length - 12} 条
                </div>
              )}
            </div>

            <div className="card">
              <h3>薄弱知识点</h3>
              <div className="muted" style={{ marginBottom: 6 }}>
                命中任一条件即列入
              </div>
              {progress.weakList.length === 0 ? (
                <div className="empty">暂无薄弱知识点</div>
              ) : (
                progress.weakList.slice(0, 12).map((w) => (
                  <div className="list-row" key={w.knowledgePointId}>
                    <div className="grow">
                      <div className="kp-id">{w.knowledgePointId}</div>
                      <div className="desc">
                        {w.reasons.map(reasonLabel).join(" · ")}
                      </div>
                    </div>
                    <span className="pill pill-line">{w.reasons.length} 因</span>
                  </div>
                ))
              )}
              {progress.weakList.length > 12 && (
                <div className="muted mt8" style={{ textAlign: "right" }}>
                  …还有 {progress.weakList.length - 12} 条
                </div>
              )}
            </div>

            <div className="card">
              <h3>学习概览</h3>
              <div className="muted" style={{ marginBottom: 10 }}>
                基于已学知识点稳定性区间
              </div>
              <div className="bar-row">
                <span className="nm">累计复习</span>
                <div className="progress-track">
                  <div
                    className="progress-fill herb"
                    style={{
                      width: Math.min(
                        100,
                        progress.reviewedCount > 0
                          ? Math.min(100, Math.log10(progress.reviewedCount + 1) * 50)
                          : 0
                      ) + "%",
                    }}
                  />
                </div>
                <span className="val">{progress.reviewedCount}</span>
              </div>
              <div className="bar-row">
                <span className="nm">已学状态数</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: "100%" }} />
                </div>
                <span className="val">{dist?.total ?? 0}</span>
              </div>
              <div className="bar-row">
                <span className="nm">低稳定(&lt;1天)</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: "100%" }} />
                </div>
                <span className="val">{dist?.lt1day ?? 0}</span>
              </div>
              <div className="bar-row">
                <span className="nm">长稳(≥30天)</span>
                <div className="progress-track">
                  <div className="progress-fill gold" style={{ width: "100%" }} />
                </div>
                <span className="val">{dist?.gte30days ?? 0}</span>
              </div>
              <div className="muted mt12">
                说明：后端暂未提供每日热力端点，此处不伪造逐日数据。
              </div>
            </div>
          </div>

          {/* 稳定性分布条形图 */}
          <div className="card mt16">
            <h3>稳定性分布</h3>
            <div className="muted" style={{ marginBottom: 6 }}>
              FSRS 记忆稳定性（天）· 当前科目：{activeSubject?.name ?? "-"}
            </div>
            <div className="stab-chart">
              {bars.map((b) => (
                <div className="stab-bar-col" key={b.label}>
                  <div className="stab-bar-val">{b.value}</div>
                  <div
                    className="stab-bar"
                    style={{
                      height: `${Math.max(4, (b.value / maxBar) * 120)}px`,
                      background: b.color,
                    }}
                  />
                  <div className="stab-bar-lbl">{b.label}</div>
                </div>
              ))}
            </div>
            <div className="muted mt12">
              共 {dist?.total ?? 0} 个已学学习状态；覆盖率按所选科目统计。
            </div>
          </div>
        </>
      ) : (
        !progressLoading && <div className="progress-loading">暂无数据</div>
      )}
    </div>
  );
}
