/**
 * 测试用 no-op UnitOfWork。
 *
 * 直接执行 fn，无真实事务边界（并发保护由 UNIQUE 约束在生产库兜底）。
 * 所有测试统一从这里导入，避免各自内联 `{ transaction: fn => fn() }`。
 */
import type { UnitOfWork } from "@/shared/domain/unit-of-work";

export function createNoopUnitOfWork(): UnitOfWork {
  return {
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    },
  };
}
