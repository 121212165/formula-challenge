// /api/herbs GET - 中药列表查询(支持 category / level / search)
// Phase 1:subject=herb 数据源(与 /api/formulas 平行)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validItemId } from "@/lib/subject";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const categoryId = url.searchParams.get("categoryId");
    const level = url.searchParams.get("level");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (level) where.level = level;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { functions: { contains: search } },
        { meridian: { contains: search } },
        { property: { contains: search } },
      ];
    }

    const herbs = await db.herb.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: limit,
      include: { category: true },
    });

    // 只返回 herb 前缀 id(防御脏数据)
    const result = herbs
      .filter((h: any) => validItemId("herb", h.id))
      .map((h: any) => ({
        id: h.id,
        name: h.name,
        source: h.source,
        property: h.property,
        meridian: h.meridian,
        functions: h.functions,
        indications: h.indications,
        level: h.level,
        categoryId: h.categoryId,
        categoryName: h.category?.name,
      }));

    return NextResponse.json({ herbs: result });
  } catch (e) {
    console.error("[herbs] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
