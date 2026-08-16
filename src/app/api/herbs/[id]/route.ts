// /api/herbs/[id] GET - 中药详情
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DATA_CACHE_HEADERS } from "@/lib/cache";
import { validItemId } from "@/lib/subject";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    // 防御:非 herb 前缀 id 一律 404(防止越科查询方剂条目)
    if (!validItemId("herb", id)) {
      return NextResponse.json({ error: "不存在" }, { status: 404 });
    }

    const herb = await db.herb.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!herb) {
      return NextResponse.json({ error: "不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: herb.id,
      name: herb.name,
      source: herb.source,
      property: herb.property,
      meridian: herb.meridian,
      functions: herb.functions,
      indications: herb.indications,
      usage: herb.usage,
      contraindications: herb.contraindications,
      compatibility: herb.compatibility,
      mnemonic: herb.mnemonic,
      mnemonicExplanation: herb.mnemonicExplanation,
      level: herb.level,
      categoryId: herb.categoryId,
      categoryName: herb.category?.name,
    }, { headers: DATA_CACHE_HEADERS });
  } catch (e) {
    console.error("[herb-detail] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
