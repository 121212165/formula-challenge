/**
 * 全局 404 页面（App Router not-found.tsx）。
 * 让 Next.js 走自定义 not-found 生成路径，替代默认 404/500 HTML 的静态化流程，
 * 规避 15.5.x 构建期 rename 500.html 的 ENOENT bug。
 */
export default function NotFound() {
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
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>页面不存在</h1>
        <p style={{ margin: "0 0 20px", lineHeight: 1.6 }}>
          你访问的地址没有对应内容。
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: 8,
            border: "1px solid #c9b98a",
            background: "#fffdf6",
            color: "#3a342a",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          回到首页
        </a>
      </div>
    </main>
  );
}
