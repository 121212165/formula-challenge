/**
 * HTTP 层小工具：解析 JSON 请求体。
 * 解析失败 → ValidationError（router 自动映射 422），不让原始 SyntaxError 漏成 500。
 */
import { ValidationError } from "@/shared/errors";

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new ValidationError("无法读取请求体");
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("请求体必须是 JSON 对象");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("请求体不是合法 JSON");
  }
}

/** 从 URL query 取字符串参数。 */
export function queryParam(req: Request, name: string): string | null {
  const url = new URL(req.url);
  const v = url.searchParams.get(name);
  return v === null || v === "" ? null : v;
}

/** 取一个必填字符串字段；缺失/类型错 → ValidationError。 */
export function requireString(
  body: Record<string, unknown>,
  field: string
): string {
  const v = body[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new ValidationError(`缺少或非法的字段：${field}`);
  }
  return v;
}
