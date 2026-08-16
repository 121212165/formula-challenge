"use client";

// 众包纠错反馈组件(FR-4.4)
// 详情页内嵌"纠错反馈"入口:选择字段 → 填建议值/理由 → 提交后台审核
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, X, CheckCircle2 } from "lucide-react";

interface Props {
  subject: "formula" | "herb" | "acupoint";
  itemId: string;
  itemName: string;
}

// 按科目提供可纠错字段
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
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const options = FIELD_OPTIONS[subject] ?? [];

  function reset() {
    setField("");
    setValue("");
    setReason("");
    setError("");
    setDone(false);
  }

  async function handleSubmit() {
    if (!field || !value.trim() || submitting) return;
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
        <Flag className="mr-1 h-3.5 w-3.5" /> 发现数据有误?纠错反馈
      </Button>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        {done ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">感谢反馈!已提交审核,合入后其他用户即可看到</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setOpen(false); reset(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">纠错反馈 · {itemName}</p>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </div>

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

            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="填写你认为正确的字段内容(必填)"
              disabled={!field}
              aria-label="建议值"
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="补充说明或出处(可选,如教材/药典版本)"
              aria-label="理由"
            />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
              variant="accent"
              size="sm"
              className="w-full"
              onClick={handleSubmit}
              disabled={!field || !value.trim() || submitting}
            >
              {submitting ? "提交中..." : "提交反馈"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              提交后进入待审核队列,审核通过会合入正式数据
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
