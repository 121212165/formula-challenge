// /api/admin/submissions/[id] POST - 审核处置(approve/reject)
//  approve + correction:事务里合入主数据字段 + 置 approved(永不直接覆盖已审数据)
//  approve + flag:置 approved(复查完成信号)
//  reject:置 rejected + 备注
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

// 字段白名单:只能合入这些字段,防任意字段注入
const FIELD_WHITELIST: Record<string, string[]> = {
  formula: ["functions", "indications", "ingredients", "mnemonic", "usage"],
  herb: ["property", "meridian", "functions", "indications", "usage", "contraindications", "mnemonic"],
  acupoint: ["location", "indications", "method", "special", "caution", "mnemonic"],
};

const MODEL_MAP = { formula: db.formula, herb: db.herb, acupoint: db.acupoint } as const;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { id: rawId } = await params;
    const id = parseInt(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "非法 id" }, { status: 400 });
    }

    let body: any;
    try {
      body = await _req.json();
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }
    const { action, note } = body ?? {};
    if (!["approve", "reject"].includes(action ?? "")) {
      return NextResponse.json({ error: "非法操作" }, { status: 400 });
    }

    const sub = await db.contentSubmission.findUnique({ where: { id } });
    if (!sub) {
      return NextResponse.json({ error: "反馈不存在" }, { status: 404 });
    }
    if (sub.status !== "pending") {
      return NextResponse.json({ error: "该反馈已处理" }, { status: 400 });
    }

    const noteStr = (note ?? "").toString().slice(0, 500);

    if (action === "reject") {
      await db.contentSubmission.update({
        where: { id },
        data: { status: "rejected", note: noteStr },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // approve
    if (sub.type === "flag") {
      // 标记复查完成:不修改主数据(信号已消费)
      await db.contentSubmission.update({
        where: { id },
        data: { status: "approved", note: noteStr },
      });
      return NextResponse.json({ ok: true, status: "approved", merged: false });
    }

    // correction:合入主数据(字段白名单校验)
    const allowed = FIELD_WHITELIST[sub.subject];
    if (!allowed || !allowed.includes(sub.field)) {
      return NextResponse.json({ error: "字段不在可合入白名单" }, { status: 400 });
    }
    const model = MODEL_MAP[sub.subject as keyof typeof MODEL_MAP] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
      update: (args: { where: { id: string }; data: Record<string, string> }) => Promise<unknown>;
    };
    const target = await model.findUnique({ where: { id: sub.itemId } });
    if (!target) {
      return NextResponse.json({ error: "目标条目不存在" }, { status: 404 });
    }

    await db.$transaction([
      (model as any).update({ where: { id: sub.itemId }, data: { [sub.field]: sub.suggestedValue } }),
      db.contentSubmission.update({ where: { id }, data: { status: "approved", note: noteStr } }),
    ]);
    return NextResponse.json({ ok: true, status: "approved", merged: true });
  } catch (e) {
    console.error("[admin/submission-review] error", e);
    return NextResponse.json({ error: "处理失败" }, { status: 500 });
  }
}
