/**
 * CompleteStudyPlan Use Case —— 完成计划（active → completed）。
 * 调用 canTransitionPlan 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudyPlan } from "../domain/study-plan";
import { canTransitionPlan } from "../domain/study-plan";
import type { StudyPlanRepository } from "../domain/study-plan-repository";

export interface CompleteStudyPlanDeps {
  planRepo: StudyPlanRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface CompleteStudyPlanCommand {
  planId: string;
}

export interface CompleteStudyPlanResult {
  plan: StudyPlan;
}

export class CompleteStudyPlan {
  constructor(private readonly deps: CompleteStudyPlanDeps) {}

  async execute(cmd: CompleteStudyPlanCommand): Promise<CompleteStudyPlanResult> {
    const { planRepo, uow } = this.deps;

    return uow.transaction(async () => {
      const plan = await planRepo.findById(cmd.planId);
      if (!plan) {
        throw new NotFoundError(`StudyPlan ${cmd.planId} 不存在`);
      }
      if (plan.status !== "active") {
        throw new InvalidStateTransitionError(
          `StudyPlan 当前状态 ${plan.status}，只能完成 active 计划`
        );
      }
      if (!canTransitionPlan(plan.status, "completed")) {
        throw new InvalidStateTransitionError(
          `StudyPlan 非法迁移：${plan.status} → completed`
        );
      }

      const updated: StudyPlan = { ...plan, status: "completed" };
      await planRepo.savePlan(updated);
      return { plan: updated };
    });
  }
}
