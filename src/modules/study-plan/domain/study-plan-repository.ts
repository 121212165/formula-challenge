/**
 * StudyPlan 仓库接口（架构文档 §23 / BR-060）。
 */

import type { StudyPlan, StudyPlanItem } from "./study-plan";

export interface StudyPlanRepository {
  findById(id: string): Promise<StudyPlan | null>;
  findByLocalDate(userId: string, localDate: string): Promise<StudyPlan | null>;
  findItemById(id: string): Promise<StudyPlanItem | null>;
  findItemsByPlan(planId: string): Promise<StudyPlanItem[]>;
  savePlan(plan: StudyPlan): Promise<void>;
  saveItem(item: StudyPlanItem): Promise<void>;
}
