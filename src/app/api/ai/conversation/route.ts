// /api/ai/conversation POST - AI 对话答疑(FR-4.2)
// 激活 AiConversation 表;每日 20 问限流;三重安全防线(FR-4.5)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { callDeepSeek, isDeepSeekConfigured, type DeepSeekMessage } from "@/lib/deepseek";
import { sanitizeAiReply, AI_SAFETY_SYSTEM_PROMPT } from "@/lib/ai-safety";

const SUBJECTS = ["formula", "herb", "acupoint"] as const;
type Subject = (typeof SUBJECTS)[number];
const DAILY_QUOTA = 20; // 每用户每日最多 20 问(需求 FR-4.2)

/** 按科目查询条目上下文(知识库片段,注入 system prompt 提升回答质量) */
async function getItemContext(subject: Subject, itemId: string) {
  if (subject === "herb") {
    const h = await db.herb.findUnique({ where: { id: itemId } });
    if (!h) return null;
    return {
      name: h.name,
      facts: `性味:${h.property}。归经:${h.meridian}。功效:${h.functions}。主治:${h.indications}。`,
    };
  }
  if (subject === "formula") {
    const f = await db.formula.findUnique({ where: { id: itemId } });
    if (!f) return null;
    return {
      name: f.name,
      facts: `组成:${f.ingredients}。功用:${f.functions}。主治:${f.indications}。`,
    };
  }
  // acupoint(Phase 2 表,数据未灌入前可能缺失)
  const a = await db.acupoint.findUnique({ where: { id: itemId } }).catch(() => null);
  if (!a) return null;
  return { name: a.name, facts: `定位:${a.location}。主治:${a.indications}。刺灸法:${a.method}。` };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }
    const { subject, itemId, question } = body ?? {};
    if (!subject || !(SUBJECTS as readonly string[]).includes(subject)) {
      return NextResponse.json({ error: "非法 subject" }, { status: 400 });
    }
    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "缺少 question" }, { status: 400 });
    }

    // 条目存在性 + 上下文
    const ctx = await getItemContext(subject as Subject, itemId);
    if (!ctx) {
      return NextResponse.json({ error: "条目不存在" }, { status: 404 });
    }

    // 每日配额:统计今日该用户的全部提问(tokens 计入)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const convos = await db.aiConversation.findMany({
      where: { userId, createdAt: { gte: todayStart } },
    });
    const usedToday = convos.reduce((s, c) => s + (c.messageCount ?? 0), 0);
    if (usedToday >= DAILY_QUOTA * 2) {
      return NextResponse.json(
        { error: "今日 AI 提问次数已用完,请明日再试" },
        { status: 429 }
      );
    }

    // 无 LLM 配置 → 降级
    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { reply: "AI 功能暂未开通,请参考教材学习", safe: false, quotaLeft: Math.max(0, DAILY_QUOTA - usedToday / 2) },
        { status: 200 }
      );
    }

    // 读取历史(多轮上下文,同 subject 同条目)
    const history = await db.aiConversation.findFirst({
      where: { userId, subject, formulaId: itemId },
      orderBy: { updatedAt: "desc" },
    });
    const historyMessages: DeepSeekMessage[] = history
      ? safeParseMessages(history.messages)
      : [];

    const messages: DeepSeekMessage[] = [
      { role: "system", content: AI_SAFETY_SYSTEM_PROMPT },
      ...historyMessages.slice(-6), // 最近 3 轮
      {
        role: "system",
        content: `当前条目:「${ctx.name}」。条目知识点:${ctx.facts}\n回答用户问题时优先基于以上知识点,仅做教材层面的解释。`,
      },
      { role: "user", content: question },
    ];

    const { content, tokensUsed } = await callDeepSeek(messages, {
      temperature: 0.3,
      maxTokens: 1500,
    });

    // 三重防线:越界 → 降级(不透传危险内容)
    const safeReply = sanitizeAiReply(content);
    if (!safeReply) {
      return NextResponse.json(
        {
          reply: "该问题涉及诊疗建议,不在本平台服务范围。请咨询执业医师。",
          safe: false,
          quotaLeft: DAILY_QUOTA - Math.ceil((usedToday + 2) / 2),
        },
        { status: 200 }
      );
    }

    // 持久化(upsert:同一会话追加)
    const newMessages = [...historyMessages, { role: "user" as const, content: question }, { role: "assistant" as const, content }];
    if (history) {
      await db.aiConversation.update({
        where: { id: history.id },
        data: {
          messages: JSON.stringify(newMessages),
          messageCount: history.messageCount + 2,
          totalTokens: history.totalTokens + tokensUsed,
        },
      });
    } else {
      await db.aiConversation.create({
        data: {
          userId,
          subject,
          formulaId: itemId,
          messages: JSON.stringify(newMessages),
          messageCount: 2,
          totalTokens: tokensUsed,
        },
      });
    }

    return NextResponse.json({
      reply: safeReply,
      safe: true,
      tokensUsed,
      quotaLeft: Math.max(0, DAILY_QUOTA - Math.ceil((usedToday + 2) / 2)),
    });
  } catch (e) {
    console.error("[conversation] error", e);
    return NextResponse.json(
      { reply: "AI 服务暂时不可用,请稍后再试", safe: false },
      { status: 200 }
    );
  }
}

function safeParseMessages(s: string | null | undefined): DeepSeekMessage[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
