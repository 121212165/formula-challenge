/**
 * API 层错误映射 —— 把领域显式错误类映射到 HTTP 状态码（架构 §62 错误契约）。
 * 领域层只抛 DomainError 子类，不感知 HTTP；映射集中在此，路由与测试共用。
 *
 *   UnauthorizedError           -> 401
 *   ForbiddenError              -> 403
 *   ValidationError             -> 422
 *   NotFoundError               -> 404
 *   ConflictError               -> 409
 *   InvalidStateTransitionError -> 409
 *   DuplicateRequestError       -> 409
 *   ContentNotPublishedError    -> 409（内容未发布，业务冲突）
 *   其它未知错误                -> 500（不回泄内部细节）
 */
import {
  ContentNotPublishedError,
  ConflictError,
  DomainError,
  DuplicateRequestError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/errors";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function statusForError(err: unknown): number {
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof ValidationError) return 422;
  if (err instanceof NotFoundError) return 404;
  if (
    err instanceof ConflictError ||
    err instanceof InvalidStateTransitionError ||
    err instanceof DuplicateRequestError ||
    err instanceof ContentNotPublishedError
  ) {
    return 409;
  }
  return 500;
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/** 把任何异常转成 JSON 错误 Response。 */
export function toErrorResponse(err: unknown): Response {
  const status = statusForError(err);
  const body: ApiErrorBody =
    err instanceof DomainError
      ? { error: { code: err.code, message: err.message } }
      : { error: { code: "INTERNAL", message: "服务器内部错误" } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 把成功结果序列化为 JSON Response。 */
export function toJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
