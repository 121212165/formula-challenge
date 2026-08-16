"use client";

// 错题本页面(重建):聚合展示答错条目,按科目分组,点击跳详情
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookX, RefreshCw } from "lucide-react";

interface WrongItem {
  subject: string;
  itemId: string;
  itemName: string;
  wrongCount: number;
  lastWrongAt: string;
}

const SUBJECT_LABEL: Record<string, string> = { formula: "方剂", herb: "中药", acupoint: "针灸" };

function detailHref(item: WrongItem): string {
  if (item.subject === "herb") return `/herbs/${encodeURIComponent(item.itemId)}`;
  if (item.subject === "acupoint") return `/acupoints/${encodeURIComponent(item.itemId)}`;
  return `/formulas/${encodeURIComponent(item.itemId)}`;
}

export default function WrongPage() {
  const router = useRouter();
  const [items, setItems] = useState<WrongItem[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/wrong-answers?limit=200");
      if (res.status === 401) {
        router.push("/auth/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "加载失败");
        return;
      }
      setItems(data.items);
    } catch {
      setError("网络异常");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = items?.filter((i) => filter === "all" || i.subject === filter) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookX className="h-6 w-6" /> 错题本
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              答错的条目自动收录 · 错次数越多越要优先复习
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} aria-label="刷新">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* 科目过滤 */}
        <div className="flex gap-2">
          {["all", "formula", "herb", "acupoint"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filter === s
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-input text-muted-foreground hover:border-accent"
              }`}
            >
              {s === "all" ? "全部" : SUBJECT_LABEL[s]}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!items && !error && (
          <p className="text-center py-8 text-muted-foreground text-sm">加载中...</p>
        )}

        {items && visible.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm space-y-2">
              <p>🎉 暂无错题</p>
              <p className="text-xs">闯关/背诵中答错的条目会自动收录到这里</p>
            </CardContent>
          </Card>
        )}

        {visible.length > 0 && (
          <div className="space-y-2">
            {visible.map((item) => (
              <Link key={`${item.subject}:${item.itemId}`} href={detailHref(item)} className="block">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {item.itemName}
                        <Badge variant="outline" className="text-xs">
                          {SUBJECT_LABEL[item.subject] ?? item.subject}
                        </Badge>
                      </CardTitle>
                      <Badge variant={item.wrongCount >= 3 ? "destructive" : "secondary"}>
                        错 {item.wrongCount} 次
                      </Badge>
                    </div>
                  </CardHeader>
                  <div className="px-4 pb-3 text-xs text-muted-foreground">
                    最近答错:{new Date(item.lastWrongAt).toLocaleDateString("zh-CN")}
                    {item.wrongCount >= 3 && " · 高频错题,建议立即复习"}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
