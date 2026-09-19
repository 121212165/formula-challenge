"use client";

/**
 * 内容页（受保护业务页）—— 对齐原型 content 视图。
 *
 * 数据全部经 api-client 打 /api：
 *   GET /api/subjects                 → 三个科目 tab（formula / herb / acupoint）
 *   GET /api/content?subjectId=X      → 当前科目下已发布内容列表
 *   GET /api/content/:id             → 内容基本信息（详情弹层）
 *   GET /api/content/:id/knowledge-points → 该内容下已发布知识点
 *
 * 交互：
 *   - 左侧科目 tab 切换 → 重新拉内容列表；
 *   - 顶部搜索框 → 前端按 name 中文 includes 模糊过滤（不请求后端）；
 *   - 点击内容卡 → 打开详情弹层，并行取基本信息 + 知识点列表。
 *
 * 注意：列表接口不返回 category，故不做分类筛选；按科目 tab 浏览即可。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import "./content.css";

/* ===== 与后端读模型对齐的最小类型（仅本页用到的字段） ===== */
interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface ContentItem {
  id: string;
  subjectId: string;
  slug: string;
  name: string;
  status: string;
}

interface KnowledgePoint {
  id: string;
  contentItemId: string;
  code: string;
  type: string;
  title: string;
  canonicalAnswer: string;
  explanation: string | null;
  status: string;
  sortOrder: number;
}

/** 科目图标：按 code 选配色（与 CSS 类 ic-formula / ic-herb / ic-acupoint 对齐） */
function subjectIconClass(code: string): string {
  if (code === "herb") return "ic-herb";
  if (code === "acupoint") return "ic-acupoint";
  return "ic-formula";
}

function SubjectIcon({ code }: { code: string }) {
  // 内联 stroke 图标，与原型 ICONS 一致
  if (code === "herb") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 21c-4 0-7-3-7-8 0-5 4-10 7-10s7 5 7 10c0 5-3 8-7 8z" />
        <path d="M12 3v18" />
      </svg>
    );
  }
  if (code === "acupoint") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18M5 7h14M5 17h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5" />
    </svg>
  );
}

/** 知识点 type 美化（formula.ingredients → 组成）—— 仅做展示，不影响数据 */
function formatKpType(type: string): string {
  const map: Record<string, string> = {
    "formula.ingredients": "组成",
    "formula.functions": "功效",
    "formula.indications": "主治",
    "formula.mnemonic": "方歌",
    "herb.property": "性味",
    "herb.meridian": "归经",
    "herb.functions": "功效",
    "herb.indications": "主治",
    "herb.usage": "用法",
    "herb.contraindications": "禁忌",
    "acupoint.location": "定位",
    "acupoint.indications": "主治",
    "acupoint.method": "刺法",
    "acupoint.special": "特定穴",
    "acupoint.mnemonic": "记忆",
  };
  return map[type] ?? type;
}

export default function ContentPage() {
  /* 科目列表 + 当前选中科目 */
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string>("");
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState("");

  /* 当前科目下的内容列表 */
  const [content, setContent] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");

  /* 搜索关键字（前端过滤） */
  const [query, setQuery] = useState("");

  /* 详情弹层 */
  const [detail, setDetail] = useState<{
    item: ContentItem;
    knowledgePoints: KnowledgePoint[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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
        // 默认选中 formula（若存在），否则取第一个
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

  /* 选中科目变化 → 拉内容列表 */
  useEffect(() => {
    if (!activeSubjectId) {
      setContent([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setContentLoading(true);
      setContentError("");
      try {
        const res = await api.get<{ content: ContentItem[] }>(
          `/api/content?subjectId=${encodeURIComponent(activeSubjectId)}`
        );
        if (cancelled) return;
        setContent(res.content);
      } catch (e) {
        if (!cancelled) {
          setContentError(e instanceof ApiError ? e.message : "内容加载失败");
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSubjectId]);

  /* 前端按 name 模糊过滤（中文 includes） */
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return content;
    return content.filter((c) => c.name.includes(q));
  }, [content, query]);

  /* 打开详情弹层：并行取基本信息 + 知识点 */
  const openDetail = useCallback(async (item: ContentItem) => {
    setDetail({ item, knowledgePoints: [] });
    setDetailLoading(true);
    setDetailError("");
    try {
      const [basic, kps] = await Promise.all([
        api.get<{ content: ContentItem }>(`/api/content/${encodeURIComponent(item.id)}`),
        api.get<{ knowledgePoints: KnowledgePoint[] }>(
          `/api/content/${encodeURIComponent(item.id)}/knowledge-points`
        ),
      ]);
      setDetail({ item: basic.content, knowledgePoints: kps.knowledgePoints });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetail(null);
    setDetailError("");
  }, []);

  /* 当前选中科目对象（用于副标题） */
  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">知识库</div>
          <h1>内容</h1>
          <div className="sub">方剂 · 中药 · 腧穴，均可独立记忆</div>
        </div>
      </div>

      {subjectsError && <div className="content-error">{subjectsError}</div>}

      <div className="content-layout">
        {/* 左侧：科目 tab */}
        <div className="cat-list">
          {subjectsLoading && (
            <div className="content-loading">科目加载中…</div>
          )}
          {!subjectsLoading &&
            subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                className={"cat-item" + (s.id === activeSubjectId ? " active" : "")}
                onClick={() => setActiveSubjectId(s.id)}
              >
                <span className={"subj-ic " + subjectIconClass(s.code)}>
                  <SubjectIcon code={s.code} />
                </span>
                {s.name}
              </button>
            ))}
        </div>

        {/* 右侧：搜索 + 内容列表 */}
        <div>
          <div className="searchbar">
            <SearchIcon />
            <input
              type="text"
              placeholder="按名称搜索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {contentError && <div className="content-error">{contentError}</div>}

          {contentLoading ? (
            <div className="content-loading">内容加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div className="empty">
                {query.trim()
                  ? `没有匹配「${query.trim()}」的内容`
                  : "当前科目暂无已发布内容"}
              </div>
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="content-card"
                onClick={() => openDetail(c)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">{c.name}</div>
                  <div className="meta">slug：{c.slug} · 状态：{c.status}</div>
                </div>
                <span className="pill pill-line">查看知识点</span>
                <span className="chev">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 详情弹层 */}
      {detail && (
        <div className="detail-overlay" onClick={closeDetail}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dm-head">
              <span className="pill pill-line">
                {activeSubject ? activeSubject.name : "内容"}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={closeDetail}
              >
                关闭
              </button>
            </div>
            <h3>{detail.item.name}</h3>
            <div className="dm-sub">slug：{detail.item.slug}</div>

            {detailError && (
              <div className="content-error" style={{ marginTop: 12 }}>
                {detailError}
              </div>
            )}

            <div className="detail-block">
              <div className="dl">知识点（{detail.knowledgePoints.length}）</div>
              {detailLoading ? (
                <div className="content-loading">知识点加载中…</div>
              ) : detail.knowledgePoints.length === 0 ? (
                <div className="dv">该条目下暂无已发布知识点。</div>
              ) : (
                detail.knowledgePoints.map((kp) => (
                  <div key={kp.id} className="kp-row">
                    <div className="kp-top">
                      <span className="kp-dot" />
                      <span style={{ fontWeight: 500 }}>
                        {detail.item.name}·{formatKpType(kp.type)}
                      </span>
                      <span className="kp-code">{kp.code}</span>
                    </div>
                    <div className="kp-ans">
                      <b>标准答案：</b>
                      {kp.canonicalAnswer}
                    </div>
                    {kp.explanation && (
                      <div className="kp-exp">
                        <b>解释：</b>
                        {kp.explanation}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
