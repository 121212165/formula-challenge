"use client";

/**
 * 首页（受保护业务页）—— 对齐原型首页视图。
 *
 * 数据全部经 /api 真实取数：
 *  - GET  /api/subjects                    → 三科目（formula 方剂 / herb 中药 / acupoint 腧穴）
 *  - POST /api/study-plans/generate        { subjectIds:[首个科目id] }（幂等生成当日计划）
 *  - GET  /api/study-plans/today           → { localDate, plan, items[] } 今日任务列表
 *  - GET  /api/progress?subjectId=X        → coverage.learnedCount/publishedTotal 画进度环
 *  - 薄弱点：取当前科目的 weakList[]（每项 { knowledgePointId, reasons[] }），渲染前几条
 *  - 连续学习：后端无 streak 端点，仅用 reviewedCount 做克制概览条，不伪造日历
 *
 * 不硬编码演示数据；无友好标题的知识点（weak/due）只展示稳定编号。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import "./home.css";

/* ===== 后端契约类型（与 server/routes 对齐） ===== */
interface Subject {
  id: string;
  code: string;
  name: string;
}
interface StudyPlanItem {
  id: string;
  knowledgePointId: string;
  type: "new" | "review" | "weakness";
  reason: string;
  position: number;
  status: "pending" | "completed" | "skipped";
}
interface TodayPlan {
  localDate: string;
  plan: { id: string; status: string };
  items: StudyPlanItem[];
}
type WeakReason =
  | { type: "again"; count: number }
  | { type: "lapse"; lapseCount: number }
  | { type: "low_stability"; stability: number };
interface WeakItem {
  knowledgePointId: string;
  reasons: WeakReason[];
}
interface SubjectProgress {
  coverage: { subjectId: string; publishedTotal: number; learnedCount: number };
  reviewedCount: number;
  weakList: WeakItem[];
}

/* ===== 科目展示元数据（图标 + 配色，按 code/名称启发式匹配，兜底按序） ===== */
type SubjectKind = "formula" | "herb" | "acupoint";
function detectKind(subject: Subject, index: number): SubjectKind {
  const hay = `${subject.code} ${subject.name}`.toLowerCase();
  if (hay.includes("formula") || hay.includes("方剂")) return "formula";
  if (hay.includes("herb") || hay.includes("中药")) return "herb";
  if (hay.includes("acupoint") || hay.includes("腧穴") || hay.includes("穴")) return "acupoint";
  return (["formula", "herb", "acupoint"] as SubjectKind[])[index % 3]!;
}
const SUBJECT_LABEL: Record<SubjectKind, string> = {
  formula: "方剂",
  herb: "中药",
  acupoint: "腧穴",
};
const KIND_ICON: Record<SubjectKind, ReactNode> = {
  formula: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18M5 7h14M5 17h14" />
    </svg>
  ),
  herb: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21c-4 0-7-3-7-8 0-5 4-10 7-10s7 5 7 10c0 5-3 8-7 8z" />
      <path d="M12 3v18" />
    </svg>
  ),
  acupoint: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
    </svg>
  ),
};

/** 无友好标题时的稳定编号（取 id 尾部，确定性、不编造标题）。 */
function kpLabel(id: string): string {
  const tail = id.replace(/^[A-Za-z]+[-_]?/, "").replace(/[-_]/g, " ").trim();
  const shown = tail.length > 14 ? tail.slice(0, 14) : tail;
  return `KP · ${shown || id.slice(-8)}`;
}

const TYPE_PILL: Record<StudyPlanItem["type"], { cls: string; text: string }> = {
  new: { cls: "pill-cin", text: "新知识点" },
  review: { cls: "pill-line", text: "复习到期" },
  weakness: { cls: "pill-gold", text: "薄弱重学" },
};

function reasonText(r: WeakReason): string {
  if (r.type === "again") return `上次 again ×${r.count}`;
  if (r.type === "lapse") return `遗忘 ${r.lapseCount} 次`;
  return `稳定度 ${r.stability.toFixed(1)} 天`;
}

/** SVG 进度环（对齐原型 ringSVG：r=38，viewBox=104）。 */
function Ring({ pct, color }: { pct: number; color: string }) {
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

export default function HomePage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [today, setToday] = useState<TodayPlan | null>(null);
  const [progressBySubject, setProgressBySubject] = useState<Record<string, SubjectProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 当前主科目：默认第一个（通常 formula）
  const primarySubject = subjects[0];
  const primaryProgress = primarySubject ? progressBySubject[primarySubject.id] : undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // 1) 先取科目列表
        const subjRes = await api.get<{ subjects: Subject[] }>("/api/subjects");
        const subs = subjRes.subjects ?? [];
        if (cancelled) return;
        setSubjects(subs);

        if (subs.length === 0) return;
        const firstId = subs[0]!.id;

        // 2) 幂等生成当日计划，再取今日计划
        await api.post<unknown>("/api/study-plans/generate", { subjectIds: [firstId] }).catch(() => undefined);
        const todayRes = await api.get<TodayPlan>("/api/study-plans/today");
        if (cancelled) return;
        setToday(todayRes);

        // 3) 每个科目并行取进度（覆盖率环 + weakList + reviewedCount）
        const results = await Promise.all(
          subs.map((s) =>
            api
              .get<SubjectProgress>(`/api/progress?subjectId=${encodeURIComponent(s.id)}`)
              .then((p) => [s.id, p] as const)
              .catch(() => null)
          )
        );
        if (cancelled) return;
        const map: Record<string, SubjectProgress> = {};
        for (const r of results) if (r) map[r[0]] = r[1];
        setProgressBySubject(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "加载首页数据失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const name = user?.name || user?.email?.split("@")[0] || "同学";
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  const todayItems = today?.items ?? [];
  const doneCount = todayItems.filter((i) => i.status === "completed").length;
  const reviewedTotal = primaryProgress?.reviewedCount ?? 0;

  const weakTop = useMemo(() => {
    const list = primaryProgress?.weakList ?? [];
    return list.slice(0, 4);
  }, [primaryProgress]);

  const todayLabel = today?.localDate
    ? new Date(today.localDate + "T00:00:00").toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  if (loading) {
    return (
      <div className="empty" style={{ padding: "80px 0" }}>
        正在加载今日学习概览…
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">今日</div>
          <h1>
            {name}，{greeting}
          </h1>
          <div className="sub">{todayLabel ? `${todayLabel} · ` : ""}三科目记忆训练 · FSRS 调度</div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <Link href="/learn" className="btn btn-primary">
            开始今日学习
          </Link>
          <Link href="/review" className="btn btn-ghost">
            复习到期
          </Link>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--cinnabar)" }}>
          <div className="muted" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        </div>
      )}

      {/* 顶部四张统计卡 */}
      <div className="home-stats">
        <div className="card">
          <div className="stat cinnabar">
            <span className="num">{reviewedTotal}</span>
            <span className="lbl">累计复习（次）</span>
          </div>
          {/* 克制概览条：仅表现累计量，不伪造连续天数日历 */}
          <div className="streak-overview" aria-hidden>
            <div className="bar on" />
            <div className="bar on" />
            <div className="bar on" />
            <div className="bar today" />
          </div>
          <div className="muted">由真实 ReviewEvent 累计，无 streak 日历端点</div>
        </div>

        <div className="card">
          <div className="stat herb">
            <span className="num">{todayItems.length}</span>
            <span className="lbl">今日任务（项）</span>
          </div>
          <div className="mt12">
            <div className="progress-track">
              <div
                className="progress-fill herb"
                style={{ width: todayItems.length ? `${(doneCount / todayItems.length) * 100}%` : "0%" }}
              />
            </div>
            <div className="muted mt8">
              已完成 {doneCount} / {todayItems.length}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stat">
            <span className="num">{todayItems.filter((i) => i.type === "new").length}</span>
            <span className="lbl">今日新学知识点</span>
          </div>
          <div className="muted mt8">
            到期复习 {todayItems.filter((i) => i.type === "review").length} 项 · 薄弱重学{" "}
            {todayItems.filter((i) => i.type === "weakness").length} 项
          </div>
        </div>

        <div className="card">
          <div className="ring-wrap">
            <Ring
              pct={
                primaryProgress && primaryProgress.coverage.publishedTotal > 0
                  ? (primaryProgress.coverage.learnedCount / primaryProgress.coverage.publishedTotal) * 100
                  : 0
              }
              color="var(--herb)"
            />
            <div className="ring-num">
              <div className="n">
                {primaryProgress && primaryProgress.coverage.publishedTotal > 0
                  ? Math.round(
                      (primaryProgress.coverage.learnedCount / primaryProgress.coverage.publishedTotal) * 100
                    )
                  : 0}
                %
              </div>
              <div className="l">{primarySubject?.name ?? "科目"} 覆盖率</div>
            </div>
          </div>
        </div>
      </div>

      {/* 三栏：今日任务 / 薄弱点 / 三科目进度 */}
      <div className="grid grid-3 mt16">
        {/* 今日任务 */}
        <div className="card">
          <div className="home-section-head">
            <h3>今日任务</h3>
            <span className="pill pill-line">FSRS 调度</span>
          </div>
          {todayItems.length === 0 ? (
            <div className="empty">今日暂无计划任务，去学点新的吧</div>
          ) : (
            todayItems.slice(0, 7).map((it) => {
              const pill = TYPE_PILL[it.type];
              const done = it.status === "completed";
              return (
                <div className="list-row" key={it.id}>
                  <div className={"check" + (done ? " done" : "")}>
                    {done && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12l5 5 9-11" />
                      </svg>
                    )}
                  </div>
                  <div className="grow">
                    <div className="title">{kpLabel(it.knowledgePointId)}</div>
                    <div className="desc">{it.reason || pill.text}</div>
                  </div>
                  <span className={"pill " + pill.cls}>{pill.text}</span>
                </div>
              );
            })
          )}
          <Link href="/learn" className="btn btn-ghost mt8" style={{ width: "100%", justifyContent: "center" }}>
            {doneCount > 0 ? "继续学习" : "开始学习"}
          </Link>
        </div>

        {/* 薄弱知识点 */}
        <div className="card">
          <div className="home-section-head">
            <h3>薄弱知识点</h3>
            <span className="pill pill-cin">{weakTop.length} 项</span>
          </div>
          {weakTop.length === 0 ? (
            <div className="empty">暂无薄弱知识点，保持节奏</div>
          ) : (
            weakTop.map((w) => (
              <div className="list-row" key={w.knowledgePointId}>
                <div className="grow">
                  <div className="title">{kpLabel(w.knowledgePointId)}</div>
                  <div className="reason-chips mt8">
                    {w.reasons.map((r, i) => (
                      <span className="tag" key={i}>
                        {reasonText(r)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
          <Link href="/review" className="btn btn-ghost mt8" style={{ width: "100%", justifyContent: "center" }}>
            查看全部薄弱点
          </Link>
        </div>

        {/* 三科目进度 */}
        <div className="card">
          <div className="home-section-head">
            <h3>科目进度</h3>
            <span className="pill pill-line">{subjects.length} 科</span>
          </div>
          {subjects.length === 0 ? (
            <div className="empty">尚未加载到科目</div>
          ) : (
            subjects.map((s, idx) => {
              const kind = detectKind(s, idx);
              const p = progressBySubject[s.id];
              const total = p?.coverage.publishedTotal ?? 0;
              const learned = p?.coverage.learnedCount ?? 0;
              const pct = total > 0 ? (learned / total) * 100 : 0;
              const barCls =
                kind === "formula" ? "" : kind === "herb" ? "herb" : "gold";
              return (
                <div className="subject-tile mt8" key={s.id}>
                  <div className="row">
                    <div className={"ic ic-" + kind}>{KIND_ICON[kind]}</div>
                    <div className="grow">
                      <div className="nm">{SUBJECT_LABEL[kind]}</div>
                      <div className="ct">
                        {total} 知识点 · 已学 {learned}
                      </div>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div className={"progress-fill " + barCls} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
