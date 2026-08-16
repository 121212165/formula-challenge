"use client";

// AI 对话答疑组件(FR-4.2)
// 内嵌到条目详情页;调 /api/ai/conversation;展示回复与剩余额度
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, X } from "lucide-react";

interface Props {
  subject: "formula" | "herb" | "acupoint";
  itemId: string;
  itemName: string;
}

interface ReplyState {
  text: string;
  safe: boolean;
  quotaLeft?: number;
}

export function AiAsk({ subject, itemId, itemName }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: ReplyState }[]>([]);
  const [quotaLeft, setQuotaLeft] = useState<number | undefined>(undefined);

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, itemId, question: q }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setHistory((h) => [...h, { q, a: { text: data.error ?? "今日提问次数已用完", safe: false } }]);
      } else if (res.ok) {
        setHistory((h) => [...h, { q, a: { text: data.reply, safe: data.safe, quotaLeft: data.quotaLeft } }]);
        if (typeof data.quotaLeft === "number") setQuotaLeft(data.quotaLeft);
      } else {
        setHistory((h) => [...h, { q, a: { text: data.error ?? "提问失败", safe: false } }]);
      }
      setQuestion("");
    } catch {
      setHistory((h) => [...h, { q, a: { text: "网络异常,请稍后再试", safe: false } }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Bot className="mr-2 h-4 w-4" /> 问 AI · 教材知识答疑
      </Button>
    );
  }

  return (
    <Card className="border-accent/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" /> 问 AI
            {typeof quotaLeft === "number" && (
              <Badge variant="secondary" className="text-xs">
                今日剩余 {quotaLeft} 问
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          可追问「{itemName}」的性味归经、配伍禁忌、知识点辨析等(仅教材层面解释)
        </p>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {history.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              暂无提问,输入一个问题开始
            </p>
          )}
          {history.map((h, i) => (
            <div key={i} className="space-y-1.5">
              <div className="text-sm bg-muted rounded-md px-3 py-2">{h.q}</div>
              <div
                className={`text-sm rounded-md px-3 py-2 whitespace-pre-wrap ${
                  h.a.safe ? "bg-emerald-50 text-emerald-900" : "bg-muted text-muted-foreground"
                }`}
              >
                {h.a.text}
              </div>
            </div>
          ))}
          {loading && <p className="text-xs text-muted-foreground text-center">思考中...</p>}
        </div>

        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如:黄芩和黄连有什么区别?"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAsk();
            }}
            aria-label="AI 提问"
          />
          <Button variant="accent" onClick={handleAsk} disabled={loading || !question.trim()}>
            发送
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          AI 回答仅整理教材知识,不构成医疗建议;每日 20 问
        </p>
      </CardContent>
    </Card>
  );
}
