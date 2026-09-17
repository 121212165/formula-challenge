/**
 * Question 仓库接口。
 */

import type { QuestionInstance, QuestionTemplate } from "./question";

export interface QuestionRepository {
  findTemplateById(id: string): Promise<QuestionTemplate | null>;
  findTemplate(knowledgePointType: string, type: QuestionTemplate["type"]): Promise<QuestionTemplate | null>;
  findInstanceById(id: string): Promise<QuestionInstance | null>;
  saveInstance(instance: QuestionInstance): Promise<void>;
}
