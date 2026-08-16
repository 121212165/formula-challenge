"use client";

// 腧穴详情客户端组件(Phase 2)
// 信息展示 + 定位默写闯关(FR-3.5:locationKeywordScore)
import { useState } from "react";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Swords } from "lucide-react";
import { locationKeywordScore } from "@/lib/subject-scoring";
import { isPass } from "@/lib/match";
import { AiAsk } from "@/components/ai-ask";
import { FeedbackForm } from "@/components/feedback-form";

export interface AcupointView {
  id: string;
  name: string;
  pinyin: string;
  code: string;
  meridianName: string;
  location: string;
  indications: string;
  method: string;
  special: string;
  caution: string;
  mnemonic: string;
  mnemonicExplanation: string;
  level: string;
}

export function AcupointDetail({ acupoint }: { acupoint: AcupointView }) {
  const [mode, setMode] = useState<"view" | "quiz">("view");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(
    null
  );

  function handleSubmit() {
    if (!answer.trim()) return;
    const score = locationKeywordScore(answer, acupoint.location);
    setResult({ score, passed: isPass(score) });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {mode === "quiz" && (
          <Button variant="ghost" size="sm" onClick={() => { setMode("view"); setAnswer(""); setResult(null); }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> 返回详情
          </Button>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">{acupoint.name}</h1>
            {acupoint.code && (
              <span className="font-mono text-sm text-muted-foreground">{acupoint.code}</span>
            )}
            <Badge variant={acupoint.level === "一类" ? "accent" : "secondary"}>
              {acupoint.level}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            <span>{acupoint.meridianName}</span>
            {acupoint.special && (
              <span className="ml-2">
                <Badge variant="outline" className="text-xs">{acupoint.special}</Badge>
              </span>
            )}
          </div>
        </div>

        <Separator />

        {mode === "view" ? (
          <>
            {/* 定位 + 主治 */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">定位</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {acupoint.location || "暂无"}
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">主治</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {acupoint.indications || "暂无"}
                  </p>
                </div>
                {acupoint.method && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">刺灸法</p>
                      <p className="text-sm text-muted-foreground">{acupoint.method}</p>
                    </div>
                  </>
                )}
                {acupoint.caution && (
                  <div>
                    <p className="text-sm font-medium mb-1">注意事项</p>
                    <p className="text-sm text-destructive">{acupoint.caution}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 口诀 */}
            {acupoint.mnemonic && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xl font-bold tracking-wider">{acupoint.mnemonic}</p>
                  {acupoint.mnemonicExplanation && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {acupoint.mnemonicExplanation}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 闯关入口 */}
            <Button variant="accent" size="lg" className="w-full" onClick={() => setMode("quiz")}>
              <Swords className="mr-2 h-4 w-4" /> 定位默写闯关
            </Button>

            {/* AI 对话答疑 */}
            <AiAsk subject="acupoint" itemId={acupoint.id} itemName={acupoint.name} />

            {/* 众包纠错反馈 */}
            <FeedbackForm subject="acupoint" itemId={acupoint.id} itemName={acupoint.name} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">闯关测试 · 默写「{acupoint.name}」的定位</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                提示:默写定位要点(如「腕横纹上2寸,两肌腱之间」),命中关键解剖标志即可得分
              </p>
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="请输入定位描述"
                disabled={!!result}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !result) handleSubmit();
                }}
                aria-label="定位输入"
              />
              {!result && (
                <Button variant="accent" className="w-full" onClick={handleSubmit} disabled={!answer.trim()}>
                  提交答案
                </Button>
              )}
              {result && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-md ${
                    result.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {result.passed ? "通过！" : "未通过"}
                  <span className="ml-2">得分:{Math.round(result.score * 100)} 分</span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setAnswer(""); setResult(null); }}>
                    再来一次
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
