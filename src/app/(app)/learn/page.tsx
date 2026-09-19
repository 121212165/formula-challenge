"use client";

/**
 * 学习答题主链路（最关键）—— 真实跑通：
 *
 *  开 Session → 取题 → 作答 → 对答案 → 四评级(Again/Hard/Good/Easy) → FSRS → 下一题。
 *
 * 流程（严格对照 api-http-loop 契约）：
 *  a. 顶部选科目（默认 formula）。点"开始学习"：
 *     - POST /api/study-plans/generate { subjectIds:[subjectId] }，从 items 提取 knowledgePointId 列表；
 *     - 若无 plan 数据，则 GET /api/content?subjectId=X 取第一个 content，
 *       再 GET /api/content/:id/knowledge-points 取其 KPs。
 *  b. POST /api/sessions { subjectId, knowledgePointIds, mode:"daily" } → { session, items[] }。
 *  c. 循环每个 session item：
 *     - POST /api/sessions/:id/items → 激活 pending→active，返回 { item }（无 pending 则 item=null → 完成页）
 *     - POST /api/sessions/:id/items/:itemId/question { type } → { instance, question }
 *     - 按 question.kind 三分支渲染（free_recall / fill_blank / recognition）
 *     - 记 startedAt=开始答题时刻；POST /api/attempts { sessionItemId, userAnswer,
 *       clientRequestId:crypto.randomUUID(), startedAt } → { attempt }
 *     - 对答案页：题干 + 用户答案 + 正确答案 + 对错
 *     - 四评级 → POST /api/attempts/:id/review { rating } → { evaluation, review }
 *     - "下一题" 回到 c；items 耗尽 → 完成页
 *
 * 支持从 query ?sessionId= 恢复已有会话（复习页跳转进来继续答题）。
 * 所有数据经 /api，不硬编码演示题。
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import "./learn.css";

/* ===== 后端契约类型 ===== */
interface Subject {
  id: string;
  code: string;
  name: string;
}
interface SessionItem {
  id: string;
  knowledgePointId: string;
  status: "pending" | "active" | "completed" | "skipped";
}
interface Session {
  id: string;
  subjectId: string;
  mode: string;
  status: string;
}
interface StartSessionResult {
  session: Session;
  items: SessionItem[];
}
interface NextItemResult {
  session: Session;
  item: SessionItem | null;
  questionInstanceId: string | null;
}

interface FreeRecallQ {
  kind: "free_recall";
  stem: string;
  acceptedAnswers: string[];
  requiredRatio: number;
}
interface FillBlankSlot {
  slot: string;
  accept: string[];
}
interface FillBlankQ {
  kind: "fill_blank";
  stem: string;
  blanks: FillBlankSlot[];
}
interface RecognitionQ {
  kind: "recognition";
  stem: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
}
type Question = FreeRecallQ | FillBlankQ | RecognitionQ;
interface QuestionResult {
  instance: { sessionItemId: string; knowledgePointId: string };
  question: Question | null;
}
interface AttemptResult {
  created: boolean;
  attempt: { id: string; status: string };
}
interface Evaluation {
  score: number;
  isCorrect: boolean;
  confidence: number;
  feedback: string | null;
}
interface ReviewResult {
  evaluation: Evaluation;
  review: {
    created: boolean;
    reviewEvent: { rating: string; nextState: { dueAt: string; stability: number } };
  };
}

type Phase = "pick" | "boot" | "answering" | "revealed" | "rated" | "done";
type Rating = "again" | "hard" | "good" | "easy";

const RATING_META: { value: Rating; r: string; d: string }[] = [
  { value: "again", r: "Again", d: "重来一次" },
  { value: "hard", r: "Hard", d: "有点难" },
  { value: "good", r: "Good", d: "记住了" },
  { value: "easy", r: "Easy", d: "太简单" },
];
const KIND_LABEL: Record<Question["kind"], string> = {
  free_recall: "自由复述",
  fill_blank: "填空补全",
  recognition: "单选识别",
};
const QUESTION_TYPE_ROTATION = ["free_recall", "recognition", "fill_blank"] as const;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : "请求失败，请重试";
}
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s，。、；：！？·—–\-—（）()【】《》〈〉"'“”‘’、,.;:!?]/g, "")
    .toLowerCase();
}
/** 客户端启发式判对错（权威以 review 返回的 evaluation.isCorrect 为准）。 */
function clientVerdict(q: Question, ua: string): boolean {
  const u = norm(ua);
  if (!u) return false;
  if (q.kind === "free_recall") return q.acceptedAnswers.some((a) => norm(a) && u.includes(norm(a)));
  if (q.kind === "recognition") return norm(q.correctAnswer) === u;
  const parts = ua.split(/[、，,;；|]/).map((s) => s.trim());
  return q.blanks.every((b, i) => b.accept.some((a) => norm(a) === norm(parts[i] ?? "")));
}
function canonicalAnswer(q: Question): string {
  if (q.kind === "free_recall") return q.acceptedAnswers[0] ?? "";
  if (q.kind === "recognition") return q.correctAnswer;
  return q.blanks.map((b) => b.accept[0] ?? "").join("、");
}
function formatDue(due: string): string {
  const days = Math.round((new Date(due).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "今天到期";
  if (days === 1) return "明天复习";
  return `${days} 天后复习`;
}
function subjectName(subjects: Subject[], id: string): string {
  return subjects.find((s) => s.id === id)?.name ?? id;
}

export default function LearnPage() {
  const searchParams = useSearchParams();
  const resumeSessionId = searchParams.get("sessionId");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [phase, setPhase] = useState<Phase>(resumeSessionId ? "boot" : "pick");

  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId);
  const [currentItem, setCurrentItem] = useState<SessionItem | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);

  // 作答输入
  const [recallText, setRecallText] = useState("");
  const [fillAnswers, setFillAnswers] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const [startedAt, setStartedAt] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [attemptId, setAttemptId] = useState("");
  const [lastUserAnswer, setLastUserAnswer] = useState("");
  const [clientCorrect, setClientCorrect] = useState(false);
  const [ratedRating, setRatedRating] = useState<Rating | null>(null);
  const [nextDueText, setNextDueText] = useState("");
  const [serverCorrect, setServerCorrect] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const qTypeRot = useRef(0);
  const bootedRef = useRef(false);

  /* 挂载：取科目列表，默认 formula */
  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>("/api/subjects")
      .then((res) => {
        const subs = res.subjects ?? [];
        setSubjects(subs);
        const def =
          subs.find((s) => s.code.toLowerCase().includes("formula")) ?? subs[0];
        if (def) setSubjectId(def.id);
      })
      .catch(() => setError("加载科目失败"));
  }, []);

  /* 计时器：作答阶段每秒刷新 */
  useEffect(() => {
    if (phase !== "answering" || !startedAt) return;
    const t = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }, 1000);
    setElapsed(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)));
    return () => clearInterval(t);
  }, [phase, startedAt]);

  /** 取下一 item 并出题（核心循环单步）。 */
  async function loadNext(sid: string) {
    setBusy(true);
    setError("");
    try {
      // 激活下一个 pending item
      const next = await api.post<NextItemResult>(`/api/sessions/${sid}/items`);
      if (!next.item) {
        setCurrentItem(null);
        setCurrentQuestion(null);
        setPhase("done");
        return;
      }
      const item = next.item;

      // 题型轮转：优先轮换，模板不存在则回退 free_recall，保证循环不崩
      const preferred = QUESTION_TYPE_ROTATION[qTypeRot.current % QUESTION_TYPE_ROTATION.length]!;
      qTypeRot.current += 1;
      let qres: QuestionResult;
      try {
        qres = await api.post<QuestionResult>(
          `/api/sessions/${sid}/items/${item.id}/question`,
          { type: preferred }
        );
      } catch {
        qres = await api.post<QuestionResult>(
          `/api/sessions/${sid}/items/${item.id}/question`,
          { type: "free_recall" }
        );
      }
      if (!qres.question) throw new Error("后端未返回题目内容");

      setCurrentItem(item);
      setCurrentQuestion(qres.question);
      setRecallText("");
      setSelectedOption(null);
      setFillAnswers(
        qres.question.kind === "fill_blank"
          ? new Array(qres.question.blanks.length).fill("")
          : []
      );
      setStartedAt(new Date().toISOString());
      setElapsed(0);
      setAttemptId("");
      setLastUserAnswer("");
      setClientCorrect(false);
      setServerCorrect(null);
      setRatedRating(null);
      setNextDueText("");
      setPhase("answering");
    } catch (e) {
      setError(errMsg(e));
      setPhase("pick");
    } finally {
      setBusy(false);
    }
  }

  /** 开始新学习会话（首页/学习页主入口）。 */
  async function startStudy() {
    if (!subjectId) {
      setError("请先选择科目");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // a. 从今日计划提取知识点
      let kpIds: string[] = [];
      try {
        const gen = await api.post<{ items: { knowledgePointId: string }[] }>(
          "/api/study-plans/generate",
          { subjectIds: [subjectId] }
        );
        kpIds = (gen.items ?? []).map((i) => i.knowledgePointId).filter(Boolean);
      } catch {
        /* 计划生成失败则走 content 兜底 */
      }
      // 兜底：取第一个 content 的知识点
      if (kpIds.length === 0) {
        const cl = await api.get<{ content: { id: string }[] }>(
          `/api/content?subjectId=${encodeURIComponent(subjectId)}`
        );
        const first = cl.content?.[0];
        if (first) {
          const kps = await api.get<{ knowledgePoints: { id: string }[] }>(
            `/api/content/${first.id}/knowledge-points`
          );
          kpIds = (kps.knowledgePoints ?? []).map((k) => k.id);
        }
      }
      if (kpIds.length === 0) {
        setError("该科目暂无可学知识点");
        setBusy(false);
        return;
      }
      // b. 开 session
      const res = await api.post<StartSessionResult>("/api/sessions", {
        subjectId,
        knowledgePointIds: kpIds,
        mode: "daily",
      });
      const sid = res.session.id;
      setSessionId(sid);
      await loadNext(sid);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  /* 从 query ?sessionId 恢复：只跑一次 */
  useEffect(() => {
    if (resumeSessionId && !bootedRef.current) {
      bootedRef.current = true;
      void loadNext(resumeSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSessionId]);

  /** 提交作答。 */
  async function submitAnswer() {
    if (!currentItem || !currentQuestion) return;
    let ua = "";
    if (currentQuestion.kind === "free_recall") ua = recallText.trim();
    else if (currentQuestion.kind === "recognition")
      ua = selectedOption != null ? (currentQuestion.options[selectedOption] ?? "") : "";
    else ua = fillAnswers.map((a) => a.trim()).join("、");
    if (!ua) {
      setError("请先作答再提交");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post<AttemptResult>("/api/attempts", {
        sessionItemId: currentItem.id,
        userAnswer: ua,
        clientRequestId: crypto.randomUUID(),
        startedAt,
      });
      setAttemptId(res.attempt.id);
      setLastUserAnswer(ua);
      setClientCorrect(clientVerdict(currentQuestion, ua));
      setPhase("revealed");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  /** 四评级 → FSRS 调度。 */
  async function rate(rating: Rating) {
    if (!attemptId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post<ReviewResult>(`/api/attempts/${attemptId}/review`, { rating });
      setRatedRating(rating);
      setServerCorrect(res.evaluation.isCorrect);
      const due = res.review?.reviewEvent?.nextState?.dueAt;
      setNextDueText(due ? formatDue(due) : "");
      setPhase("rated");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (sessionId) void loadNext(sessionId);
  }

  /* ===== 渲染 ===== */
  const verdictCorrect = serverCorrect ?? clientCorrect;

  // 选科目 / 未开始
  if (phase === "pick") {
    return (
      <div className="learn-shell">
        <div className="page-head">
          <div>
            <div className="eyebrow">学习</div>
            <h1>开始训练</h1>
            <div className="sub">选定科目后按 FSRS 调度出题，自由复述 / 填空 / 单选混合</div>
          </div>
        </div>
        <div className="card">
          <div className="learn-startbar">
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
            <button className="btn btn-primary" onClick={startStudy} disabled={busy || !subjectId}>
              {busy ? "准备中…" : "开始学习"}
            </button>
          </div>
          {error && <div className="field-error mt8">{error}</div>}
        </div>
      </div>
    );
  }

  // 完成页
  if (phase === "done") {
    return (
      <div className="learn-shell">
        <div className="card done-card">
          <div className="num">本轮完成</div>
          <h3 className="mt12">这一轮学习结束</h3>
          <div className="muted mt8">记忆状态已按 FSRS 更新，可稍后回到复习页巩固。</div>
          <div className="mt16" style={{ display: "flex", gap: 9, justifyContent: "center" }}>
            <Link href="/" className="btn btn-ghost">
              回首页
            </Link>
            <Link href="/review" className="btn btn-primary">
              去复习
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // boot / answering / revealed / rated
  const q = currentQuestion;
  const subjLabel = sessionId
    ? subjectName(subjects, subjects.find((s) => s.id === subjectId)?.id ?? subjectId)
    : "";

  return (
    <div className="learn-shell">
      {/* 步骤指示 */}
      <div className="progress-steps">
        {["出题", "作答", "评价", "评级", "调度"].map((s, i) => {
          const stepIdx = phase === "answering" ? 1 : phase === "revealed" ? 2 : phase === "rated" ? 3 : 0;
          const state = i < stepIdx ? "done" : i === stepIdx ? "on" : "";
          return (
            <span key={s} style={{ display: "contents" }}>
              <div className={"step " + state}>
                <span className="dot" />
                {s}
              </div>
              {i < 4 && <div className="step-line" />}
            </span>
          );
        })}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--cinnabar)" }}>
          <div className="field-error">{error}</div>
        </div>
      )}

      {phase === "boot" && !q ? (
        <div className="card">
          <div className="empty">{busy ? "正在加载下一题…" : "正在开始会话…"}</div>
        </div>
      ) : q ? (
        <div className="q-card">
          <div className="q-meta">
            <span className="pill pill-line">{subjLabel || "科目"}</span>
            <span className="pill pill-line">{KIND_LABEL[q.kind]}</span>
            {phase === "answering" && (
              <span className="timer" style={{ marginLeft: "auto" }}>
                ⏱ {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            )}
          </div>

          <div className="q-body">{q.stem}</div>

          {/* 作答区 */}
          {phase === "answering" && (
            <>
              {q.kind === "free_recall" && (
                <textarea
                  className="answer-box"
                  placeholder="在此复述…"
                  value={recallText}
                  onChange={(e) => setRecallText(e.target.value)}
                />
              )}

              {q.kind === "fill_blank" && (
                <div className="fill-sentence">
                  {q.stem.split("____").map((seg, i, arr) => (
                    <span key={i}>
                      {seg}
                      {i < arr.length - 1 && (
                        <input
                          className="fill-input"
                          value={fillAnswers[i] ?? ""}
                          onChange={(e) => {
                            const next = [...fillAnswers];
                            next[i] = e.target.value;
                            setFillAnswers(next);
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}

              {q.kind === "recognition" && (
                <div className="opt-list">
                  {q.options.map((opt, i) => (
                    <button
                      key={i}
                      className={"opt" + (selectedOption === i ? " selected" : "")}
                      onClick={() => setSelectedOption(i)}
                    >
                      <span className="key">{"ABCD"[i]}</span>
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="learn-actions">
                <button className="btn btn-primary" onClick={submitAnswer} disabled={busy}>
                  {busy ? "提交中…" : "提交答案"}
                </button>
              </div>
            </>
          )}

          {/* 对答案 + 四评级 */}
          {phase === "revealed" && (
            <div className={"eval-panel " + (verdictCorrect ? "eval-correct" : "eval-wrong")}>
              <div className="verdict">{verdictCorrect ? "回答正确" : "回答有误"}</div>
              <div className="your-answer">
                <b>你的作答：</b>
                {lastUserAnswer || "（空）"}
              </div>
              <div className="std-answer">
                <b>标准答案：</b>
                {canonicalAnswer(q)}
              </div>
              <div className="rating-row">
                {RATING_META.map((r) => (
                  <button
                    key={r.value}
                    className="rate-btn"
                    data-rating={r.value}
                    onClick={() => rate(r.value)}
                    disabled={busy}
                  >
                    <div className="r">{r.r}</div>
                    <div className="d">{r.d}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 评级后下一调度 banner */}
          {phase === "rated" && ratedRating && (
            <>
              <div
                className={"eval-panel " + ((serverCorrect ?? clientCorrect) ? "eval-correct" : "eval-wrong")}
              >
                <div className="verdict">{(serverCorrect ?? clientCorrect) ? "系统判分：正确" : "系统判分：有误"}</div>
                <div className="std-answer">
                  你评了 <b style={{ textTransform: "capitalize" }}>{ratedRating}</b>
                  {nextDueText && ` · ${nextDueText}`}
                </div>
              </div>
              <div className="next-banner">
                <div style={{ flex: 1 }}>
                  <div className="when">已按 FSRS 更新记忆状态</div>
                  <div className="big">
                    {RATING_META.find((r) => r.value === ratedRating)?.r} · {nextDueText || "已调度"}
                  </div>
                </div>
                <button className="btn btn-primary" onClick={goNext} disabled={busy}>
                  下一题
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
