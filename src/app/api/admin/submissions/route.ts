// /api/admin/submissions - 众包反馈审核(FR-4.4 后台)
// GET: 管理员查看待审核列表(pending,带每条目的 flag 标记数,信号驱动优先处理)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 200);

    const submissions = await db.contentSubmission.findMany({
      where: { status },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });

    // 每条目的 flag 标记数(信号:多人标记 → 优先复查)
    const flagGroups = await db.contentSubmission.groupBy({
      by: ["itemId"],
      where: { type: "flag", status: "pending" },
      _count: { id: true },
    });
    const flagCountMap = new Map(flagGroups.map((g: any) => [g.itemId, g._count.id]));

    return NextResponse.json({
      submissions: submissions.map((s: any) => ({
        id: s.id,
        subject: s.subject,
        itemId: s.itemId,
        itemName: s.itemName,
        type: s.type,
        field: s.field,
        fieldLabel: s.fieldLabel,
        suggestedValue: s.suggestedValue,
        reason: s.reason,
        createdAt: s.createdAt,
        flagCount: s.type === "correction" ? (flagCountMap.get(s.itemId) ?? 0) : 0,
      })),
    });
  } catch (e) {
    console.error("[admin/submissions] error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
