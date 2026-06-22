import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await db.formulaCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { formulas: true } } },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">方剂分类</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((c, idx) => (
            <Link key={c.id} href={`/categories/${c.id}`}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      <span className="text-muted-foreground mr-2">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      {c.name}
                    </CardTitle>
                    <Badge variant="secondary">{c._count?.formulas ?? 0} 首</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
