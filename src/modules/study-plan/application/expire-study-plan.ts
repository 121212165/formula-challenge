/**
 * ExpireStudyPlan Use Case —— 计划过期（active → expired）。
 * 调用 canTransitionPlan 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudyPlan } from "../domain/study-plan";
import { canTransitionPlan } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

export interface ExpireStudyPlanDeps {
  planRepo: StudyPlanRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface ExpireStudyPlanCommand {
  planId: string;
}

export interface ExpireStudyPlanResult {
  plan: StudyPlan;
}

export class ExpireStudyPlan {
  constructor(private readonly deps: ExpireStudyPlanDeps) {}

  async execute(cmd: ExpireStudyPlanCommand): Promise<ExpireStudyPlanResult> {
    const { planRepo, uow } = this.deps;

    return uow.transaction(async () => {
      const plan = await planRepo.findById(cmd.planId);
      if (!plan) {
        throw new NotFoundError(`StudyPlan ${cmd.planId} 不存在`);
      }
      if (plan.status !== "active") {
        throw new InvalidStateTransitionError(
          `StudyPlan 当前状态 ${plan.status}，只能过期 active 计划`
        );
      }
      if (!canTransitionPlan(plan.status, "expired")) {
        throw new InvalidStateTransitionError(
          `StudyPlan 非法迁移：${plan.status} → expired`
        );
      }

      const updated: StudyPlan = { ...plan, status: "expired" };
      await planRepo.savePlan(updated);
      return { plan: updated };
    });
  }
}
