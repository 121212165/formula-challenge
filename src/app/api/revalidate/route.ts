// POST /api/revalidate - 手动/种子入库后主动失效 ISR 缓存
// 鉴权:CRON_SECRET(Bearer header 或 ?secret=)
// body: { paths: string[] } 例:["/herbs", "/api/herbs"]
// 用法:种子入库后 curl -X POST https://565737.xyz/api/revalidate \
//        -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
//        -d '{"paths":["/herbs","/acupoints","/categories","/api/herbs","/api/acupoints"]}'
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const secretParam = url.searchParams.get("secret");
  if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let paths: string[];
  try {
    const body = await req.json();
    paths = Array.isArray(body?.paths) ? body.paths : [];
  } catch {
    return NextResponse.json({ error: "body 需为 JSON:{paths: string[]}" }, { status: 400 });
  }

  // 只允许白名单内的路径,防止任意路径探测
  const allowedPrefix = ["/herbs", "/acupoints", "/categories", "/formulas", "/search", "/api/herbs", "/api/acupoints", "/api/formulas"];
  const blocked = paths.filter((p) => !allowedPrefix.some((pre) => p === pre || p.startsWith(pre + "/")));
  if (blocked.length) {
    return NextResponse.json({ error: `非法路径:${blocked.join(",")}` }, { status: 400 });
  }

  for (const p of paths) {
    revalidatePath(p, "page");
  }
  return NextResponse.json({ ok: true, revalidated: paths.length });
}
