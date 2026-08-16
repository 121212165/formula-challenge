// /api/feedback/submit - 众包反馈(FR-4.4,发现/修正分离)
// POST:
//   type=flag       → 一键标记"数据有问题"(不需要提供答案,任何人可做;信号驱动复查)
//   type=correction → 提交候选修正值(有值,经审核后才合入主数据,永不直接覆盖)
// GET: 查看自己提交的历史
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const SUBJECTS = ["formula", "herb", "acupoint"] as const;
const TYPES = ["flag", "correction"] as const;
const MAX_LEN = 2000;
// 防刷:同一用户对同一条目同一字段的待审数量上限(flag/correction 各自计数)
const MAX_PENDING_PER_TYPE = 3;

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

    const { subject, itemId, itemName, type, field, fieldLabel, suggestedValue, reason } = body ?? {};
    const t = type === "correction" ? "correction" : "flag";

    if (!subject || !(SUBJECTS as readonly string[]).includes(subject)) {
      return NextResponse.json({ error: "非法科目" }, { status: 400 });
    }
    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "缺少条目 id" }, { status: 400 });
    }

    // correction 必须有建议值;flag 允许空值(只是"觉得不对"的信号)
    if (t === "correction") {
      if (!suggestedValue || typeof suggestedValue !== "string" || !suggestedValue.trim()) {
        return NextResponse.json({ error: "修正需填写你掌握的准确内容" }, { status: 400 });
      }
      if (suggestedValue.length > MAX_LEN) {
        return NextResponse.json({ error: `内容不能超过 ${MAX_LEN} 字` }, { status: 400 });
      }
      if (!field || typeof field !== "string") {
        return NextResponse.json({ error: "缺少字段名" }, { status: 400 });
      }
    }
    if (suggestedValue && typeof suggestedValue === "string" && suggestedValue.length > MAX_LEN) {
      return NextResponse.json({ error: `内容不能超过 ${MAX_LEN} 字` }, { status: 400 });
    }

    // 防刷:同类型下同条目同字段 pending ≤ 3
    const where: Record<string, unknown> = { userId, subject, itemId, type: t, status: "pending" };
    if (field) where.field = field;
    const pendingCount = await db.contentSubmission.count({ where });
    if (pendingCount >= MAX_PENDING_PER_TYPE) {
      return NextResponse.json(
        { error: "该条目已有待审核反馈,请勿重复提交" },
        { status: 429 }
      );
    }

    const submission = await db.contentSubmission.create({
      data: {
        userId,
        subject,
        itemId,
        itemName: itemName ?? "",
        type: t,
        field: field ?? "",
        fieldLabel: fieldLabel ?? "",
        suggestedValue: suggestedValue?.trim() ?? "",
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
