/**
 * 结构化 JSON 行日志（Phase 13）—— 每条日志一行 JSON，便于 grep / 日志采集。
 *
 * sink 可注入：生产默认写 console.stdout；测试传入内存数组 sink 以便断言捕获。
 * 字段（关键接口）：level, msg, requestId, userId, method, path, durationMs, status, error。
 * 中文一律以 utf-8 写入（JSON.stringify 默认就是 utf-8 安全转义，logger 不做额外编码）。
 */

export interface LogSink {
  write(line: string): void;
}

/** 进程默认 sink：写 stdout（utf-8）。 */
export const stdoutSink: LogSink = {
  write(line: string): void {
    process.stdout.write(line + "\n");
  },
};

/** 内存 sink（测试断言用）：收集全部行，同时保留对象数组便于按字段断言。 */
export function createMemorySink(): LogSink & { lines: string[]; records: Record<string, unknown>[] } {
  const records: Record<string, unknown>[] = [];
  const lines: string[] = [];
  return {
    lines,
    records,
    write(line: string): void {
      lines.push(line);
      try {
        records.push(JSON.parse(line));
      } catch {
        /* 非 JSON 行忽略解析 */
      }
    },
  };
}

export interface RequestLogFields {
  requestId: string;
  userId?: string;
  method: string;
  path: string;
  durationMs: number;
  status: number;
  /** 业务错误 code（已知 DomainError.code）或 "INTERNAL"（未知错误）；成功为 undefined */
  error?: string;
  /** 未知错误时的服务端堆栈（仅落服务端日志，绝不进响应 body） */
  stack?: string;
}

export interface StructuredLogger {
  /** 记录一个关键请求（一条 JSON 行）。 */
  logRequest(fields: RequestLogFields): void;
  /** 服务端错误堆栈（单独一条 error 级日志，含 requestId）。 */
  logServerError(requestId: string, err: unknown): void;
}

export function createStructuredLogger(sink: LogSink = stdoutSink): StructuredLogger {
  const emit = (obj: Record<string, unknown>): void => {
    sink.write(JSON.stringify(obj));
  };
  return {
    logRequest(fields) {
      emit({
        ts: new Date().toISOString(),
        level: fields.status >= 500 ? "error" : fields.status >= 400 ? "warn" : "info",
        msg: "http.request",
        ...fields,
      });
    },
    logServerError(requestId, err) {
      emit({
        ts: new Date().toISOString(),
        level: "error",
        msg: "http.unhandled_error",
        requestId,
        error: err instanceof Error ? err.name : "UnknownError",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    },
  };
}
