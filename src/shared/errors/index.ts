/**
 * 领域错误。
 * Domain 只抛出这些显式错误；HTTP 状态码映射属于 API 层。
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  constructor(message = "未认证") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  constructor(message = "无权限") {
    super(message);
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION";
  constructor(message = "输入不合法") {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(message = "资源不存在") {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
  constructor(message = "状态冲突") {
    super(message);
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = "INVALID_STATE_TRANSITION";
  constructor(message = "非法的状态流转") {
    super(message);
  }
}

export class DuplicateRequestError extends DomainError {
  readonly code = "DUPLICATE_REQUEST";
  constructor(message = "重复请求") {
    super(message);
  }
}

export class ContentNotPublishedError extends DomainError {
  readonly code = "CONTENT_NOT_PUBLISHED";
  constructor(message = "内容未发布") {
    super(message);
  }
}
