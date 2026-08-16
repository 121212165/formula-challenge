// /api/acupoints GET - 腧穴列表查询(支持 meridianId / level / search)
// Phase 2:subject=acupoint 数据源(与 /api/herbs 平行)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validItemId } from "@/lib/subject";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const meridianId = url.searchParams.get("meridianId");
    const level = url.searchParams.get("level");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

    const where: Record<string, unknown> = {};
    if (meridianId) where.meridianId = parseInt(meridianId);
    if (level) where.level = level;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { indications: { contains: search } },
        { pinyin: { contains: search } },
      ];
    }

    const acupoints = await db.acupoint.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: limit,
      include: { meridian: true },
    });

    // 只返回 a_ 前缀 id(防御脏数据)
    const result = acupoints
      .filter((a: any) => validItemId("acupoint", a.id))
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        pinyin: a.pinyin,
        code: a.code,
        meridianId: a.meridianId,
        meridianName: a.meridian?.name ?? "",
        location: a.location,
        indications: a.indications,
        special: a.special,
        level: a.level,
      }));

    return NextResponse.json({ acupoints: result });
  } catch (e) {
    console.error("[acupoints] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
