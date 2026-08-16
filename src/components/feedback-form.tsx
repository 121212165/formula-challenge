"use client";

// 众包反馈组件(FR-4.4,发现/修正分离)
//  通道 1:「数据有问题」→ 一键标记 flag(不需要知道正确答案,任何人可做)
//  通道 2:「我有更准确的版本」→ 提交 correction 候选值(经审核才合入主数据)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, X, CheckCircle2, BookOpenCheck } from "lucide-react";

interface Props {
  subject: "formula" | "herb" | "acupoint";
  itemId: string;
  itemName: string;
}

const FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  formula: [
    { value: "functions", label: "功用" },
    { value: "indications", label: "主治" },
    { value: "ingredients", label: "组成" },
    { value: "mnemonic", label: "方歌" },
    { value: "usage", label: "用法" },
  ],
  herb: [
    { value: "property", label: "性味" },
    { value: "meridian", label: "归经" },
    { value: "functions", label: "功效" },
    { value: "indications", label: "主治" },
    { value: "usage", label: "用法用量" },
    { value: "contraindications", label: "禁忌" },
    { value: "mnemonic", label: "口诀" },
  ],
  acupoint: [
    { value: "location", label: "定位" },
    { value: "indications", label: "主治" },
    { value: "method", label: "刺灸法" },
    { value: "special", label: "特定穴属性" },
    { value: "caution", label: "注意事项" },
    { value: "mnemonic", label: "歌诀" },
  ],
};

export function FeedbackForm({ subject, itemId, itemName }: Props) {
  const [open, setOpen] = useState(false);
  // mode: "flag" 一键标记(无需答案) | "correction" 提供准确版本 | null 未选择
  const [mode, setMode] = useState<"flag" | "correction" | null>(null);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const options = FIELD_OPTIONS[subject] ?? [];

  function reset() {
    setMode(null);
    setField("");
    setValue("");
    setReason("");
    setError("");
    setDone(false);
  }

  async function handleSubmit() {
    if (submitting) return;
    // flag 允许不选字段/不填值;correction 必须有字段+值
    if (mode === "correction" && (!field || !value.trim())) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          itemId,
          itemName,
          type: mode,
          field,
          fieldLabel: options.find((o) => o.value === field)?.label ?? "",
          suggestedValue: value.trim(),
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
      } else {
        setError(data.error ?? "提交失败,请稍后再试");
      }
    } catch {
      setError("网络异常,请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Flag className="mr-1 h-3.5 w-3.5" /> 数据有误或有补充?反馈
      </Button>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        {done ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">
              {mode === "flag" ? "已标记,感谢反馈!我们将复核该条目" : "感谢反馈!已提交审核,合入后其他用户即可看到"}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setOpen(false); reset(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : mode === null ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">反馈 · {itemName}</p>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              不需要懂中医也能帮忙:发现不对,先标记;如果你掌握准确内容,再补充。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => setMode("flag")}>
                <Flag className="h-4 w-4" />
                <span className="text-sm">数据有问题</span>
                <span className="text-[10px] text-muted-foreground font-normal">一键标记,不用填答案</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => setMode("correction")}>
                <BookOpenCheck className="h-4 w-4" />
                <span className="text-sm">我有更准确的版本</span>
                <span className="text-[10px] text-muted-foreground font-normal">提交候选,审核后合入</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {mode === "flag" ? "标记问题 · " : "提交准确版本 · "}
                {itemName}
              </p>
              <Button variant="ghost" size="sm" onClick={() => reset()} aria-label="返回">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {mode === "flag" ? (
              <p className="text-xs text-muted-foreground">
                你觉得哪里不对?选个字段或直接写原因即可——不必给出正确答案,我们会复核
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                你掌握更准确的版本?选择字段并填写内容(会进入待审核,不会直接覆盖现有数据)
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setField(o.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    field === o.value
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-input text-muted-foreground hover:border-accent"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {mode === "correction" && (
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="填写你认为准确的字段内容(必填)"
                disabled={!field}
                aria-label="建议值"
              />
            )}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "flag" ? "哪里不对 / 缺了什么(选填)" : "补充说明或出处(选填,如教材/药典版本)"}
              aria-label="理由"
            />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
              variant="accent"
              size="sm"
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || (mode === "correction" && (!field || !value.trim()))}
            >
              {submitting ? "提交中..." : mode === "flag" ? "提交标记" : "提交候选"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {mode === "flag"
                ? "标记 = 提醒复核,不影响现有数据;多人标记会优先处理"
                : "候选 = 待审核,通过后才会合入正式数据"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
