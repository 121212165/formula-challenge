"use client";

/**
 * 复习页（受保护业务页）—— 三 tab：到期 / 薄弱 / 错题。
 *
 * 数据全部经 /api：
 *  - GET /api/progress/due?subjectId=X        → { dueList: [{knowledgePointId, dueAt, stability}] }
 *  - GET /api/progress/weaknesses?subjectId=X → { weakList: [{knowledgePointId, reasons[]}] }
 *  - 错题 tab：后端无独立错题端点，取 weakList 中 reasons 含 again 的子集（标注"薄弱/易错"）
 *
 * "开始复习"：收集当前列表的 knowledgePointId →
 *   POST /api/sessions { subjectId, knowledgePointIds, mode:"review" }
 *   → 跳 /learn?sessionId=...（learn 页支持从 query 恢复继续答题）。
 *
 * 无友好标题的知识点只展示稳定编号，不编造标题。
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import "./review.css";

interface Subject {
  id: string;
  code: string;
  name: string;
}
interface DueItem {
  knowledgePointId: string;
  dueAt: string;
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
interface StartSessionResult {
  session: { id: string };
}

type Tab = "due" | "weak" | "wrong";

/** 稳定编号（无标题时展示，不编造）。 */
function kpLabel(id: string): string {
  const tail = id.replace(/^[A-Za-z]+[-_]?/, "").replace(/[-_]/g, " ").trim();
  const shown = tail.length > 14 ? tail.slice(0, 14) : tail;
  return `KP · ${shown || id.slice(-8)}`;
}
function reasonChips(r: WeakReason): string {
  if (r.type === "again") return `上次 again ×${r.count}`;
  if (r.type === "lapse") return `遗忘 ${r.lapseCount} 次`;
  return `稳定度 ${r.stability.toFixed(1)} 天`;
}
function fmtDue(d: string): string {
  const ms = new Date(d).getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return "今天到期";
  if (days === 1) return "明天到期";
  return `${days} 天后到期`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [tab, setTab] = useState<Tab>("due");

  const [dueList, setDueList] = useState<DueItem[]>([]);
  const [weakList, setWeakList] = useState<WeakItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  /* 挂载：取科目，默认 formula */
  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>("/api/subjects")
      .then((res) => {
        const subs = res.subjects ?? [];
        setSubjects(subs);
        const def = subs.find((s) => s.code.toLowerCase().includes("formula")) ?? subs[0];
        if (def) setSubjectId(def.id);
      })
      .catch(() => setError("加载科目失败"));
  }, []);

  /* 科目变化：并行取 due / weak */
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      api.get<{ dueList: DueItem[] }>(`/api/progress/due?subjectId=${encodeURIComponent(subjectId)}`),
      api.get<{ weakList: WeakItem[] }>(`/api/progress/weaknesses?subjectId=${encodeURIComponent(subjectId)}`),
    ])
      .then(([due, weak]) => {
        if (cancelled) return;
        setDueList(due.dueList ?? []);
        setWeakList(weak.weakList ?? []);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "加载复习队列失败"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  // 错题 tab：weakList 中 reasons 含 again 的子集
  const wrongList = useMemo(
    () => weakList.filter((w) => w.reasons.some((r) => r.type === "again")),
    [weakList]
  );

  const activeList =
    tab === "due" ? dueList.map((d) => d.knowledgePointId)
    : tab === "weak" ? weakList.map((w) => w.knowledgePointId)
    : wrongList.map((w) => w.knowledgePointId);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "due", label: "到期", count: dueList.length },
    { key: "weak", label: "薄弱", count: weakList.length },
    { key: "wrong", label: "错题", count: wrongList.length },
  ];

  async function startReview() {
    if (!subjectId || activeList.length === 0) return;
    setStarting(true);
    setError("");
    try {
      const res = await api.post<StartSessionResult>("/api/sessions", {
        subjectId,
        knowledgePointIds: activeList,
        mode: "review",
      });
      router.push(`/learn?sessionId=${encodeURIComponent(res.session.id)}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "创建复习会话失败");
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">复习</div>
          <h1>记忆巩固</h1>
          <div className="sub">到期优先 · 高遗忘风险 · 近期错误（数据来自 FSRS 进度读模型）</div>
        </div>
      </div>

      {/* 顶部：科目选择 + 开始复习 */}
      <div className="rev-top">
        <label className="muted">科目</label>
        <select
          className="select-box"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          disabled={subjects.length === 0}
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={startReview}
          disabled={starting || activeList.length === 0 || loading}
        >
          {starting ? "创建会话…" : `开始复习（${activeList.length}）`}
        </button>
      </div>

      {/* 三 tab */}
      <div className="tab-row">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={"tab-pill" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className={"rev-num" + (t.count === 0 ? " idle" : "")}>{t.count}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--cinnabar)" }}>
          <div className="field-error">{error}</div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty">正在加载复习队列…</div>
        ) : tab === "due" ? (
          dueList.length === 0 ? (
            <div className="empty">今天没有到期任务，可以去学点新的</div>
          ) : (
            dueList.map((d) => (
              <div className="list-row" key={d.knowledgePointId}>
                <div className="grow">
                  <div className="title">{kpLabel(d.knowledgePointId)}</div>
                  <div className="desc">
                    {fmtDue(d.dueAt)} · 稳定度 {d.stability.toFixed(1)} 天
                  </div>
                </div>
                <span className="pill pill-line">到期</span>
              </div>
            ))
          )
        ) : tab === "weak" ? (
          weakList.length === 0 ? (
            <div className="empty">暂无薄弱知识点</div>
          ) : (
            weakList.map((w) => (
              <div className="list-row" key={w.knowledgePointId}>
                <div className="grow">
                  <div className="title">{kpLabel(w.knowledgePointId)}</div>
                  <div className="desc mt8">
                    {w.reasons.map((r, i) => (
                      <span className="rev-reason" key={i}>
                        {reasonChips(r)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="pill pill-cin">薄弱</span>
              </div>
            ))
          )
        ) : wrongList.length === 0 ? (
          <div className="empty">暂无错题记录（近期 again 的知识点）</div>
        ) : (
          wrongList.map((w) => (
            <div className="list-row" key={w.knowledgePointId}>
              <div className="grow">
                <div className="title">{kpLabel(w.knowledgePointId)}</div>
                <div className="desc mt8">
                  {w.reasons.map((r, i) => (
                    <span className="rev-reason" key={i}>
                      {reasonChips(r)}
                    </span>
                  ))}
                </div>
              </div>
              <span className="pill pill-gold">易错</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
