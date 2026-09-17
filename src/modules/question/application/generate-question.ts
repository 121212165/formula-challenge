/**
 * GenerateQuestion Use Case —— 为一个 SessionItem 生成题目实例（架构文档 §14）。
 * 同一 KnowledgePoint 可多次用不同题型出题：本次 free_recall，下次 fill_blank。
 */

import { NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { QuestionInstance, QuestionType } from "../domain/question";
import type { QuestionRepository } from "../domain/question-repository";

export interface GenerateQuestionDeps {
  questions: QuestionRepository;
  knowledgePoints: KnowledgePointRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface GenerateQuestionCommand {
  sessionItemId: string;
  knowledgePointId: string;
  /** 不传则用该 KnowledgePoint 类型对应的默认模板（free_recall） */
  type?: QuestionType;
  /** 已有实例数（用于 sequence 递增）；不传则查库 */
  existingCount?: number;
}

export interface GenerateQuestionResult {
  instance: QuestionInstance;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class GenerateQuestion {
  constructor(private readonly deps: GenerateQuestionDeps) {}

  async execute(cmd: GenerateQuestionCommand): Promise<GenerateQuestionResult> {
    const { questions, knowledgePoints, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const kp = await knowledgePoints.findPublishedById(cmd.knowledgePointId);
      if (!kp) {
        throw new NotFoundError("KnowledgePoint 不存在或未发布");
      }

      const type = cmd.type ?? "free_recall";
      const template = await questions.findTemplate(kp.type, type);
      if (!template) {
        throw new ValidationError(`知识点类型 ${kp.type} 没有可用的 ${type} 模板`);
      }
      if (!template.enabled) {
        throw new ValidationError(`模板 ${template.id} 未启用`);
      }

      const sequence =
        cmd.existingCount ??
        (await questions.countInstancesBySessionItem(cmd.sessionItemId));

      const instance: QuestionInstance = {
        id: idGen(),
        sessionItemId: cmd.sessionItemId,
        knowledgePointId: kp.id,
        templateId: template.id,
        sequence,
        generatedAt: now(),
      };

      await questions.saveInstance(instance);
      return { instance };
    });
  }
}
