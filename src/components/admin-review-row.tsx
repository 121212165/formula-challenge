"use client";

// 审核行组件:展示一条 pending 反馈,支持 通过(合入)/驳回(带备注)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface AdminSubmission {
  id: number;
  subject: string;
  itemId: string;
  itemName: string;
  type: "flag" | "correction";
  field: string;
  fieldLabel: string;
  suggestedValue: string;
  reason: string;
  createdAt: string;
  flagCount: number;
}

const SUBJECT_LABEL: Record<string, string> = { formula: "方剂", herb: "中药", acupoint: "针灸" };

export function AdminReviewRow({ sub }: { sub: AdminSubmission }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/submissions/${sub.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "操作失败");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常");
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={sub.type === "correction" ? "accent" : "secondary"}>
          {sub.type === "correction" ? "候选修正" : "问题标记"}
        </Badge>
        <Badge variant="outline">{SUBJECT_LABEL[sub.subject] ?? sub.subject}</Badge>
        <span className="text-sm font-medium">
          {sub.itemName}
          <span className="text-muted-foreground font-normal"> · {sub.fieldLabel || sub.field}</span>
        </span>
        {sub.flagCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {sub.flagCount} 人标记
          </Badge>
        )}
      </div>

      {sub.type === "correction" ? (
        <div className="text-sm bg-muted rounded-md px-3 py-2 whitespace-pre-wrap">
          <span className="text-muted-foreground">建议值:</span> {sub.suggestedValue}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          该条目被标记为「数据有问题」,请复查对应字段
        </div>
      )}

      {sub.reason && (
        <div className="text-xs text-muted-foreground">理由: {sub.reason}</div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 items-center">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="审核备注(选填)"
          className="h-8 text-xs"
          aria-label="审核备注"
        />
        <Button size="sm" variant="accent" disabled={busy} onClick={() => act("approve")}>
          {sub.type === "correction" ? "通过并合入" : "已复查"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("reject")}>
          驳回
        </Button>
      </div>
    </div>
  );
}
