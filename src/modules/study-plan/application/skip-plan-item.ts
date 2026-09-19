/**
 * SkipPlanItem Use Case —— 跳过一个待办计划条目（pending → skipped）。
 *
 * 与 CompletePlanItem 对称：只改 StudyPlanItem.status，绝不写 LearningState（BR-062）。
 * 走 canTransitionPlanItem 守卫：item 没有 active 态，唯一合法迁移是 pending → skipped。
 * 幂等：对已 skipped 的条目再次跳过直接原样返回（不重复抛错）；
 *       对 completed（或其它非 pending）条目跳过抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudyPlanItem } from "../domain/study-plan";
import { canTransitionPlanItem } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

export interface SkipPlanItemDeps {
  planRepo: StudyPlanRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface SkipPlanItemCommand {
  itemId: string;
}

export class SkipPlanItem {
  constructor(private readonly deps: SkipPlanItemDeps) {}

  async execute(cmd: SkipPlanItemCommand): Promise<StudyPlanItem> {
    const { planRepo, uow } = this.deps;

    return uow.transaction(async () => {
      const item = await planRepo.findItemById(cmd.itemId);
      if (!item) {
        throw new NotFoundError(`StudyPlanItem ${cmd.itemId} 不存在`);
      }
      // 幂等：已经是 skipped，直接返回（BR-062：不触碰任何其它状态）
      if (item.status === "skipped") {
        return item;
      }
      // 守卫：pending → skipped 才合法；completed 等终态非法迁移抛错
      if (!canTransitionPlanItem(item.status, "skipped")) {
        throw new InvalidStateTransitionError(
          `StudyPlanItem 状态为 ${item.status}，只能跳过 pending 条目`
        );
      }
      const updated: StudyPlanItem = { ...item, status: "skipped" };
      await planRepo.saveItem(updated);
      return updated;
    });
  }
}
