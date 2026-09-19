/**
 * 审计日志端口 + Prisma 实现（Phase 13）。
 *
 * 端口 AuditLogger：领域用例只依赖这个接口，不感知 Prisma。
 * PrismaAuditLogRepository 用 getClient(prisma) 取客户端 —— 与其它生产仓储一致：
 *   - 若在 uow.transaction 内被调用 → 复用事务客户端 tx，审计与主业务【同物理事务】，任一失败整体回滚；
 *   - 若在事务外被调用（如登录失败，本就无主业务写入）→ 根 client 自动提交。
 *
 * requestId 从请求上下文（ALS）读取，无需沿命令透传。
 */
import type { PrismaClient } from "@prisma/client";
import { getClient } from "@/shared/infrastructure/prisma-tx-context";
import { getRequestContext } from "../production/request-context";

/** 审计动作枚举（字符串常量，避免三套 schema 同步 enum 的迁移负担）。 */
export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "ISSUE_REVIEW",
  "CONTENT_PUBLISH",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditRecordInput {
  action: AuditAction;
  /** 行为主体用户 id；匿名/登录失败可为 null */
  actorUserId: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}

export interface AuditLogger {
  record(input: AuditRecordInput): Promise<void>;
}

/** 空实现：未注入审计时的 no-op（保持既有单元测试构造用例零改动）。 */
export const noopAuditLogger: AuditLogger = {
  async record(): Promise<void> {
    /* no-op */
  },
};

export class PrismaAuditLogRepository implements AuditLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: AuditRecordInput): Promise<void> {
    const requestId = getRequestContext()?.requestId ?? null;
    await getClient(this.prisma).auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        requestId,
        detail: (input.detail ?? {}) as object,
      },
    });
  }
}
