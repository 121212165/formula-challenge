/**
 * 事务边界（架构文档 §43）。
 * Domain 不直接碰 Prisma；跨聚合写入必须在一个 UnitOfWork 事务内完成。
 */

export interface UnitOfWork {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
