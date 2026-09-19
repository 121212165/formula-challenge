/**
 * PrismaUnitOfWork —— 真实事务实现（架构文档 §43）。
 *
 * 接线：transaction(fn) 内部调用 prisma.$transaction(async (tx) => runWithTx(tx, fn))。
 *
 * P1-4 架构限制已解决：tx 通过 AsyncLocalStorage 传给 fn 内所有生产仓储
 * （仓储经 getClient(this.prisma) 取当前客户端）。因此 fn 内跨仓储写入
 * （如 FinalizeReview 的 ReviewEvent+LearningState+SessionItem+StudyDay，
 * 或 RegisterUser 的 User+Profile+Credential+Token）真实共享同一物理事务，
 * 任一抛错整体回滚。详见 ./prisma-tx-context.ts。
 */
import type { PrismaClient } from "@prisma/client";
import type { UnitOfWork } from "../domain/unit-of-work";
import { runWithTx } from "./prisma-tx-context";

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly deps: { prisma: PrismaClient }) {}

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.deps.prisma.$transaction((tx) => runWithTx(tx, fn));
  }
}
