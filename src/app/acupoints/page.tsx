// 腧穴列表页(server component,Phase 2)
import Link from "next/link";
import { db } from "@/lib/db";
import { Header } from "@/components/header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AcupointsPage() {
  const [meridians, acupoints] = await Promise.all([
    db.meridian.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { acupoints: true } } },
    }),
    db.acupoint.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const totalCount = acupoints.length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">针灸</h1>
            <p className="text-sm text-muted-foreground mt-1">
              共 {totalCount} 穴 · 十四经 · 定位主治
            </p>
          </div>
          <Badge variant="accent">数据扩充中</Badge>
        </div>

        {/* 经络导航 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {meridians.map((m) => (
            <Link
              key={m.id}
              href={`/acupoints?meridian=${m.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="p-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{m.name}</CardTitle>
                    <Badge variant="secondary">{m._count?.acupoints ?? 0}</Badge>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {/* 全部腧穴列表 */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">全部腧穴</h2>
          {acupoints.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              暂无数据,Phase 2 部署时写入种子数据
            </p>
          ) : (
            acupoints.map((a: any) => (
              <Link key={a.id} href={`/acupoints/${a.id}`} className="block">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {a.name}
                        <span className="font-mono text-xs text-muted-foreground font-normal">
                          {a.code}
                        </span>
                      </CardTitle>
                      <Badge
                        variant={a.level === "一类" ? "accent" : "secondary"}
                      >
                        {a.level}
                      </Badge>
                    </div>
                  </CardHeader>
                  {a.indications && (
                    <div className="px-4 pb-3 text-xs text-muted-foreground truncate">
                      {a.indications}
                    </div>
                  )}
                </Card>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
