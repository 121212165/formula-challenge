/**
 * GetTodayPlan / CompletePlanItem Use Case（架构文档 §23 / §41）。
 * CompletePlanItem 只记录任务完成，不修改 LearningState（BR-062）。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudyPlan, StudyPlanItem } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

/** 只读用例 GetTodayPlan 的依赖：无需事务 */
export interface StudyPlanDeps {
  planRepo: StudyPlanRepository;
}

/** 写用例 CompletePlanItem 的依赖：planRepo + uow（与 verify-email / reset-password 风格一致） */
export interface CompletePlanItemDeps {
  planRepo: StudyPlanRepository;
  uow: UnitOfWork;
}

export interface TodayPlanCommand {
  userId: string;
  localDate: string;
}

export interface TodayPlanResult {
  plan: StudyPlan | null;
  items: StudyPlanItem[];
}

export class GetTodayPlan {
  constructor(private readonly deps: StudyPlanDeps) {}

  async execute(cmd: TodayPlanCommand): Promise<TodayPlanResult> {
    const plan = await this.deps.planRepo.findByLocalDate(cmd.userId, cmd.localDate);
    if (!plan) return { plan: null, items: [] };
    return { plan, items: await this.deps.planRepo.findItemsByPlan(plan.id) };
  }
}

export interface CompletePlanItemCommand {
  itemId: string;
}

export class CompletePlanItem {
  constructor(private readonly deps: CompletePlanItemDeps) {}

  async execute(cmd: CompletePlanItemCommand): Promise<StudyPlanItem> {
    const { planRepo, uow } = this.deps;
    // findItemById + saveItem 包入事务，与其它写用例风格一致（P2-9）
    return uow.transaction(async () => {
      const item = await planRepo.findItemById(cmd.itemId);
      if (!item) {
        throw new NotFoundError(`StudyPlanItem ${cmd.itemId} 不存在`);
      }
      if (item.status !== "pending") {
        throw new InvalidStateTransitionError(
          `StudyPlanItem 状态为 ${item.status}，只能完成 pending 条目`
        );
      }
      const updated: StudyPlanItem = { ...item, status: "completed" };
      await planRepo.saveItem(updated);
      return updated;
    });
  }
}
