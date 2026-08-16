// 错题本 API(重建)
// GET /api/wrong-answers:聚合当前用户答错(isCorrect=false)的条目
//   按 subject+条目 分组:错次数 / 最近答错时间;名称从各科主数据补齐
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const url = new URL(req.url);
    const subject = url.searchParams.get("subject");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

    // 聚合窗口:最近 500 条错题记录
    const logs = await db.answerLog.findMany({
      where: {
        userId,
        isCorrect: false,
        ...(subject ? { subject } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { subject: true, formulaId: true, createdAt: true },
    });

    // 按 subject+itemId 分组
    const groups = new Map<string, { subject: string; itemId: string; wrongCount: number; lastWrongAt: Date }>();
    for (const log of logs) {
      const key = `${log.subject}:${log.formulaId}`;
      const g = groups.get(key);
      if (g) {
        g.wrongCount += 1;
        if (log.createdAt > g.lastWrongAt) g.lastWrongAt = log.createdAt;
      } else {
        groups.set(key, {
          subject: log.subject,
          itemId: log.formulaId,
          wrongCount: 1,
          lastWrongAt: log.createdAt,
        });
      }
    }

    const items = [...groups.values()].sort(
      (a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt.getTime() - a.lastWrongAt.getTime()
    );
    const sliced = items.slice(0, limit);

    // 补齐条目名称(按科目批量查)
    const names = new Map<string, string>();
    const herbIds = sliced.filter((s) => s.subject === "herb").map((s) => s.itemId);
    const acuIds = sliced.filter((s) => s.subject === "acupoint").map((s) => s.itemId);
    const formulaIds = sliced.filter((s) => s.subject === "formula").map((s) => s.itemId);
    if (herbIds.length) {
      const rows = await db.herb.findMany({ where: { id: { in: herbIds } }, select: { id: true, name: true } });
      for (const r of rows) names.set(r.id, r.name);
    }
    if (acuIds.length) {
      const rows = await db.acupoint.findMany({ where: { id: { in: acuIds } }, select: { id: true, name: true } });
      for (const r of rows) names.set(r.id, r.name);
    }
    if (formulaIds.length) {
      const rows = await db.formula.findMany({ where: { id: { in: formulaIds } }, select: { id: true, name: true } });
      for (const r of rows) names.set(r.id, r.name);
    }

    return NextResponse.json({
      items: sliced.map((s) => ({
        subject: s.subject,
        itemId: s.itemId,
        itemName: names.get(s.itemId) ?? s.itemId,
        wrongCount: s.wrongCount,
        lastWrongAt: s.lastWrongAt.toISOString(),
      })),
      total: sliced.length,
    });
  } catch (e) {
    console.error("[wrong-answers] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
