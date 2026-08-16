"use client";

// 中药详情客户端组件(Phase 1)
// 信息展示 + 功效默写闯关(FR-2.5 新评分规则:functionClauseScore)
import { useState } from "react";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Swords } from "lucide-react";
import { functionClauseScore } from "@/lib/subject-scoring";
import { isPass } from "@/lib/match";
import { AiAsk } from "@/components/ai-ask";

export interface HerbView {
  id: string;
  name: string;
  source: string;
  property: string;
  meridian: string;
  functions: string;
  indications: string;
  usage: string;
  contraindications: string;
  compatibility: string;
  mnemonic: string;
  mnemonicExplanation: string;
  level: string;
  categoryName?: string;
}

export function HerbDetail({ herb }: { herb: HerbView }) {
  const [mode, setMode] = useState<"view" | "quiz">("view");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(
    null
  );

  function handleSubmit() {
    if (!answer.trim()) return;
    const score = functionClauseScore(answer, herb.functions);
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
            <h1 className="text-3xl font-bold tracking-tight">{herb.name}</h1>
            <Badge variant={herb.level === "一类" ? "accent" : "secondary"}>
              {herb.level}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {herb.categoryName && <span>{herb.categoryName}</span>}
            {herb.source && <span className="ml-2">· {herb.source}</span>}
          </div>
        </div>

        <Separator />

        {mode === "view" ? (
          <>
            {/* 性味归经 + 功效 */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-sm font-medium mb-1">性味</p>
                    <p className="text-sm text-muted-foreground">
                      {herb.property || "暂无"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">归经</p>
                    <p className="text-sm text-muted-foreground">
                      {herb.meridian || "暂无"}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">功效</p>
                  <p className="text-sm text-muted-foreground">
                    {herb.functions || "暂无"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">主治</p>
                  <p className="text-sm text-muted-foreground">
                    {herb.indications || "暂无"}
                  </p>
                </div>
                {herb.usage && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">用法用量</p>
                      <p className="text-sm text-muted-foreground">{herb.usage}</p>
                    </div>
                  </>
                )}
                {herb.contraindications && (
                  <div>
                    <p className="text-sm font-medium mb-1">禁忌</p>
                    <p className="text-sm text-destructive">{herb.contraindications}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 口诀 */}
            {herb.mnemonic && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xl font-bold tracking-wider">{herb.mnemonic}</p>
                  {herb.mnemonicExplanation && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {herb.mnemonicExplanation}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 闯关入口 */}
            <Button variant="accent" size="lg" className="w-full" onClick={() => setMode("quiz")}>
              <Swords className="mr-2 h-4 w-4" /> 功效默写闯关
            </Button>

            {/* AI 对话答疑 */}
            <AiAsk subject="herb" itemId={herb.id} itemName={herb.name} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">闯关测试 · 默写「{herb.name}」的功效</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                提示:按「清热燥湿,泻火解毒」格式默写功效,同义表述也算对
              </p>
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="请输入功效,用逗号分隔"
                disabled={!!result}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !result) handleSubmit();
                }}
                aria-label="功效输入"
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
