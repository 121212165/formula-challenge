/**
 * Catch-all API 路由 —— 把后端已装配好的 ApiRouter 整体挂进 Next.js App Router。
 *
 * 挂载点：/api/[[...slug]]，匹配 /api 下任意路径（含 0 段）。
 *  例如：
 *    POST /api/auth/register   → slug=["auth","register"]
 *    GET  /api/me              → slug=["me"]
 *    GET  /api/content/:id     → slug=["content","<id>"]
 *
 *  Next.js 传入的 req.url 已是完整 /api/... 路径，ApiRouter.dispatch 内部
 *  new URL(req.url).pathname 自行解析路径参数（:id 等），这里不再二次解析。
 * 鉴权由后端从 Authorization: Bearer <token> 自行提取，请求头原样透传。
 *
 * 五个方法逐一转发；未匹配的方法/路径由 ApiRouter 统一返回 405/404 JSON。
 */
import { getServerRouter } from "@/server/get-server-container";

// 这是薄代理层，永远走动态执行，不做静态优化 / 数据缓存。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 把同一个 Web Request 交给后端 ApiRouter 分发。 */
function dispatch(req: Request): Promise<Response> {
  return getServerRouter().dispatch(req);
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function PUT(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return dispatch(req);
}
