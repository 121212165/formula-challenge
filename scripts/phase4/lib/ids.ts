/**
 * Phase 4 管线 · ID 与 slug 生成
 *
 * cuid：c 开头 + 24 位十六进制，由「毫秒时间戳(8) + 进程内计数器(4) +
 * 随机(6+6)」拼成。纯 TS 实现，不依赖 npm 包。格式与 Prisma @default(cuid())
 * 的外观一致（c 前缀 + 24 位），便于后续直连数据库时无感替换。
 *
 * slug：不做拼音、不沿用源表 h_/a_/c_ 前缀；统一为
 *   `<subject 短码>-<4 位行序>`，如 formula-0001 / herb-0042 / acupoint-0007。
 * 中文名只存 ContentItem.name，不进 slug。
 */
import type { SubjectCode } from "@/shared/types/knowledge-point-type";

/** cuid 格式：c + 24 位小写十六进制。 */
export const CUID_PATTERN = /^c[0-9a-f]{24}$/;

let counter = 0;

function randHex(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/** 生成一个 cuid 格式 ID（格式合法，进程内近似唯一）。 */
export function cuid(): string {
  counter = (counter + 1) % 0xffff;
  const ts = Date.now().toString(16).padStart(8, "0").slice(-8);
  const c = counter.toString(16).padStart(4, "0");
  return `c${ts}${c}${randHex(6)}${randHex(6)}`;
}

/** 校验字符串是否为合法 cuid。 */
export function isCuid(value: string): boolean {
  return CUID_PATTERN.test(value);
}

/**
 * 生成 slug：subject 短码 + 4 位行序。
 * @param subject 科目短码
 * @param seq 行序（从 1 开始，按 raw 文件顺序）
 */
export function slugify(subject: SubjectCode, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`slugify: seq 必须是 >=1 的整数，收到 ${seq}`);
  }
  return `${subject}-${String(seq).padStart(4, "0")}`;
}

/** 从 KP type 推导同 contentItemId 内唯一的 code，如 formula.ingredients → ingredients。 */
export function kpCodeOf(type: string): string {
  const parts = type.split(".");
  return parts[parts.length - 1] ?? type;
}
