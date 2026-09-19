/**
 * Prisma 事务上下文（AsyncLocalStorage）—— 解决"tx 不传递"架构限制。
 *
 * 背景（P1-4 / PrismaUnitOfWork 旧实现）：use case 内 `uow.transaction(async () => { ...repos.xxx.save()... })`
 * 的 fn 不接收 tx；若各仓储各自持有独立 PrismaClient，则跨仓储写入并不共享物理事务。
 *
 * 方案：在 `$transaction(async (tx) => ...)` 回调里把 tx 存入 AsyncLocalStorage。
 * 生产仓储的每个方法调用 `getClient(this.prisma)` 取客户端：
 *   - 若处于事务内 → 返回事务客户端 tx（所有仓储写在同一物理事务）；
 *   - 若不在事务内 → 返回根 PrismaClient（自动提交，与既有行为一致）。
 * 这样领域接口签名 `transaction<T>(fn: () => Promise<T>)` 与仓储接口都无需改动，
 * use case 代码零修改即可获得真实跨聚合原子性。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

const txStore = new AsyncLocalStorage<TxClient>();

/** 在给定事务客户端上下文中运行 fn（由 PrismaUnitOfWork 调用）。 */
export function runWithTx<T>(tx: TxClient, fn: () => Promise<T>): Promise<T> {
  return txStore.run(tx, fn);
}

/**
 * 取当前生效的 Prisma 客户端：事务内返回 tx，否则返回根 client。
 * 生产仓储统一用它操作表，确保事务内跨仓储写共享同一连接/事务。
 */
export function getClient(root: PrismaClient): TxClient | PrismaClient {
  return txStore.getStore() ?? root;
}
