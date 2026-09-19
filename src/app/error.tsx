"use client";

/**
 * 全局错误边界（App Router error.tsx）。
 * 渲染层异常时展示；同时让 Next.js 不再生成默认 500.html，
 * 规避 15.5.x 在部分环境（Windows / 特定文件系统）下
 * rename .next/export/500.html -> .next/server/pages/500.html 的 ENOENT 构建 bug。
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f7f5f0",
        color: "#3a342a",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>出错了</h1>
        <p style={{ margin: "0 0 20px", lineHeight: 1.6 }}>
          页面暂时无法加载，请稍后重试。
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "10px 22px",
            borderRadius: 8,
            border: "1px solid #c9b98a",
            background: "#fffdf6",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          重试
        </button>
      </div>
    </main>
  );
}
