// 中药列表页(server component,Phase 1)
import Link from "next/link";
import { db } from "@/lib/db";
import { Header } from "@/components/header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const revalidate = 3600; // ISR:种子数据低频变更,1h 增量再验证(众包合入时 revalidatePath 主动失效)

export default async function HerbsPage() {
  const [categories, herbs] = await Promise.all([
    db.herbCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { herbs: true } } },
    }),
    db.herb.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const totalCount = herbs.length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">中药</h1>
            <p className="text-sm text-muted-foreground mt-1">
              共 {totalCount} 味 · 性味归经 · 功效主治
            </p>
          </div>
          <Badge variant="accent">数据扩充中</Badge>
        </div>

        {/* 分类导航 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/herbs?category=${c.id}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="p-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{c.name}</CardTitle>
                    <Badge variant="secondary">{c._count?.herbs ?? 0}</Badge>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {/* 全部中药列表 */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">全部中药</h2>
          {herbs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              暂无数据,Phase 1 部署时写入种子数据
            </p>
          ) : (
            herbs.map((h: any) => (
              <Link key={h.id} href={`/herbs/${h.id}`} className="block">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {h.name}
                        <span className="text-xs text-muted-foreground font-normal">
                          {h.property}
                        </span>
                      </CardTitle>
                      <Badge
                        variant={h.level === "一类" ? "accent" : "secondary"}
                      >
                        {h.level}
                      </Badge>
                    </div>
                  </CardHeader>
                  {h.functions && (
                    <div className="px-4 pb-3 text-xs text-muted-foreground truncate">
                      {h.functions}
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
