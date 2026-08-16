// 后台审核页(FR-4.4 众包闭环最后一环)
// 仅 ADMIN_EMAILS 中配置的管理员可访问;pending 列表按 flag 信号优先排序
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminReviewRow, type AdminSubmission } from "@/components/admin-review-row";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!isAdminEmail(email)) {
    notFound();
  }

  const [pending, flags, counts] = await Promise.all([
    db.contentSubmission.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.contentSubmission.findMany({
      where: { type: "flag", status: "pending" },
      select: { itemId: true },
    }),
    db.contentSubmission.groupBy({
      by: ["status", "type"],
      _count: { id: true },
    }),
  ]);

  // flag 计数:同条目 pending flag 数
  const flagCountMap = new Map<string, number>();
  for (const f of flags) flagCountMap.set(f.itemId, (flagCountMap.get(f.itemId) ?? 0) + 1);

  // 按 标记数降序 → 提交时间降序(多人标记优先)
  const sorted = [...pending].sort((a, b) => {
    const fa = a.type === "correction" ? (flagCountMap.get(a.itemId) ?? 0) : 0;
    const fb = b.type === "correction" ? (flagCountMap.get(b.itemId) ?? 0) : 0;
    if (fb !== fa) return fb - fa;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const summary: Record<string, number> = {};
  for (const c of counts) summary[`${c.type}-${c.status}`] = c._count.id;

  const rows: AdminSubmission[] = sorted.map((s) => ({
    id: s.id,
    subject: s.subject,
    itemId: s.itemId,
    itemName: s.itemName,
    type: s.type as "flag" | "correction",
    field: s.field,
    fieldLabel: s.fieldLabel,
    suggestedValue: s.suggestedValue,
    reason: s.reason,
    createdAt: s.createdAt.toISOString(),
    flagCount: s.type === "correction" ? (flagCountMap.get(s.itemId) ?? 0) : 0,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">反馈审核台</h1>
            <p className="text-sm text-muted-foreground mt-1">
              待审核 {rows.length} 条 · 已通过 {summary["correction-approved"] ?? 0} · 已驳回 {summary["correction-rejected"] ?? 0}
            </p>
          </div>
          <Badge variant="accent">管理员</Badge>
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              暂无待审核反馈 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((sub) => (
              <AdminReviewRow key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
