// LLM API 客户端封装(2026-08 扩展:支持 DeepSeek / StepFun 双 provider)
// - DeepSeek 文档:https://api-docs.deepseek.com/
// - StepFun 文档:OpenAI 兼容,base https://api.stepfun.com/step_plan/v1
// provider 选择:STEP_API_KEY 配置则用 StepFun,否则回退 DeepSeek

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
}

export interface DeepSeekResult {
  content: string;
  tokensUsed: number;
  provider: "deepseek" | "stepfun";
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;
// StepFun 推理模型注意:max_tokens 会先被 reasoning 消耗,需留足配额
const STEP_DEFAULT_MAX_TOKENS = 2500;
const STEP_DEFAULT_MODEL = "step-3.7-flash";
const STEP_BASE_URL = "https://api.stepfun.com/step_plan/v1";

export function currentProvider(): "deepseek" | "stepfun" | null {
  if (process.env.STEP_API_KEY) return "stepfun";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return null;
}

/**
 * 调用 Chat Completions API(自动选择 provider)
 * 必须在 server 端调用（Route Handler / Server Action / getServerSession 内）
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
  options: DeepSeekOptions = {}
): Promise<DeepSeekResult> {
  const provider = currentProvider();
  if (!provider) {
    throw new Error("LLM API not configured (need DEEPSEEK_API_KEY or STEP_API_KEY)");
  }

  const isStep = provider === "stepfun";
  const apiKey = isStep ? process.env.STEP_API_KEY : process.env.DEEPSEEK_API_KEY;
  const baseUrl = isStep
    ? process.env.STEP_BASE_URL || STEP_BASE_URL
    : process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  // StepFun 的 base 已含 /v1 段(step_plan/v1),DeepSeek 需拼 /v1
  const url = isStep ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const model = options.model
    ? options.model
    : isStep
      ? process.env.STEP_MODEL || STEP_DEFAULT_MODEL
      : "deepseek-chat";

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options.maxTokens ?? (isStep ? STEP_DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS),
    stream: false,
  };

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `LLM API error (${provider}): ${res.status} ${res.statusText}. ${errText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data?.usage?.total_tokens ?? 0;

  return { content, tokensUsed, provider };
}

/**
 * 调用 LLM 并解析 JSON 输出
 * 失败时返回 null（不抛错）
 */
export async function callDeepSeekJson<T = unknown>(
  messages: DeepSeekMessage[],
  options: Omit<DeepSeekOptions, "jsonMode"> = {}
): Promise<T | null> {
  try {
    const { content } = await callDeepSeek(messages, {
      ...options,
      jsonMode: true,
    });
    return JSON.parse(content) as T;
  } catch (e) {
    console.warn("[llm-json] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 检查 LLM 是否可用(任一 provider 配置即 true) */
export function isDeepSeekConfigured(): boolean {
  return currentProvider() !== null;
}
