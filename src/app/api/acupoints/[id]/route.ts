// /api/acupoints/[id] GET - 腧穴详情
// Phase 2:subject=acupoint 详情(定位/主治/刺灸法/特定穴/禁忌/口诀)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validItemId } from "@/lib/subject";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    // 防御:非 a_ 前缀 id 一律 404(防止越科查询)
    if (!validItemId("acupoint", id)) {
      return NextResponse.json({ error: "不存在" }, { status: 404 });
    }

    const acupoint = await db.acupoint.findUnique({
      where: { id },
      include: { meridian: true },
    });
    if (!acupoint) {
      return NextResponse.json({ error: "不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: acupoint.id,
      name: acupoint.name,
      pinyin: acupoint.pinyin,
      code: acupoint.code,
      meridianId: acupoint.meridianId,
      meridianName: acupoint.meridian?.name ?? "",
      location: acupoint.location,
      indications: acupoint.indications,
      method: acupoint.method,
      special: acupoint.special,
      caution: acupoint.caution,
      mnemonic: acupoint.mnemonic,
      mnemonicExplanation: acupoint.mnemonicExplanation,
      level: acupoint.level,
    });
  } catch (e) {
    console.error("[acupoint-detail] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
