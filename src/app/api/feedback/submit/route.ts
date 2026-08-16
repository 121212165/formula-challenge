// /api/feedback/submit - 众包纠错反馈(FR-4.4)
// POST: 登录用户对条目字段提交纠错建议(status=pending,后台审核)
// GET:  查看自己提交的历史
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const SUBJECTS = ["formula", "herb", "acupoint"] as const;
const MAX_LEN = 2000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    const { subject, itemId, itemName, field, fieldLabel, suggestedValue, reason } = body ?? {};

    if (!subject || !(SUBJECTS as readonly string[]).includes(subject)) {
      return NextResponse.json({ error: "非法科目" }, { status: 400 });
    }
    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "缺少条目 id" }, { status: 400 });
    }
    if (!suggestedValue || typeof suggestedValue !== "string" || !suggestedValue.trim()) {
      return NextResponse.json({ error: "缺少建议内容" }, { status: 400 });
    }
    if (suggestedValue.length > MAX_LEN) {
      return NextResponse.json({ error: `建议内容不能超过 ${MAX_LEN} 字` }, { status: 400 });
    }
    if (!field || typeof field !== "string") {
      return NextResponse.json({ error: "缺少字段名" }, { status: 400 });
    }

    // 防滥用:单用户对同一条目同一字段最多保留 3 条 pending
    const pendingCount = await db.contentSubmission.count({
      where: { userId, subject, itemId, field, status: "pending" },
    });
    if (pendingCount >= 3) {
      return NextResponse.json(
        { error: "该条目此字段已有待审核反馈,请勿重复提交" },
        { status: 429 }
      );
    }

    const submission = await db.contentSubmission.create({
      data: {
        userId,
        subject,
        itemId,
        itemName: itemName ?? "",
        field,
        fieldLabel: fieldLabel ?? "",
        suggestedValue: suggestedValue.trim(),
        reason: reason ?? "",
        status: "pending",
        note: "",
      },
    });

    return NextResponse.json({ submission, ok: true });
  } catch (e) {
    console.error("[feedback/submit] error", e);
    return NextResponse.json({ error: "提交失败,请稍后再试" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const submissions = await db.contentSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ submissions });
  } catch (e) {
    console.error("[feedback/submit] GET error", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
