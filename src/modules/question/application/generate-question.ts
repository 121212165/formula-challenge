/**
 * GenerateQuestion Use Case —— 为一个 SessionItem 生成题目实例（架构文档 §14）。
 * 同一 KnowledgePoint 可多次用不同题型出题：本次 free_recall，下次 fill_blank。
 */

import { ContentNotPublishedError, NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { QuestionInstance, QuestionType } from "../domain/question";
import type { QuestionRepository } from "../domain/question-repository";
import type { RenderedQuestion } from "../domain/rendered-question";
import type { QuestionRegistry } from "../domain/registry";
import type { SynonymMap } from "../domain/template-config";
import type { SessionItemRepository } from "@/modules/learning/domain/repositories";

export interface GenerateQuestionDeps {
  questions: QuestionRepository;
  knowledgePoints: KnowledgePointRepository;
  /** 生成实例后回写 SessionItem.questionInstanceId（P1-9 闭合题目链路） */
  sessionItems: SessionItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
  /**
   * 题型注册表（§6）。提供后会在落库后即时渲染题目（题干/选项/答案）；
   * 未提供则只落实例指针（向后兼容旧调用方）。
   * ordering 未登记：命中即显式报错，不静默退化（§3.4）。
   */
  registry?: QuestionRegistry;
  /** 取同知识点类型其他已发布 KP（recognition 干扰项来源），可选 */
  findSiblings?: (kpId: string, type: string) => Promise<KnowledgePoint[]>;
  /** 科目级同义词（挖空 accept 扩展），可选 */
  synonyms?: SynonymMap;
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
  /**
   * 渲染后的题目（仅 deps.registry 存在时返回）。
   * AI 兜底生成（Phase 11）将走同一渲染结构并经 question-model.md §5 校验。
   */
  question: RenderedQuestion | null;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class GenerateQuestion {
  constructor(private readonly deps: GenerateQuestionDeps) {}

  async execute(cmd: GenerateQuestionCommand): Promise<GenerateQuestionResult> {
    const { questions, knowledgePoints, sessionItems, uow, registry } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const kp = await knowledgePoints.findById(cmd.knowledgePointId);
      if (!kp) {
        throw new NotFoundError("KnowledgePoint 不存在");
      }
      if (kp.status !== "published") {
        throw new ContentNotPublishedError("KnowledgePoint 未发布");
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

      // 注册表门控先于写库：ordering / 未登记题型显式报错，
      // 绝不静默退化为 free_recall（§3.4），也不落孤儿实例。
      const entry = registry ? registry.get(type) : null;
      if (registry && !entry) {
        throw new ValidationError(`题型 ${type} 尚未落地出题器（不静默退化为 free_recall）`);
      }

      const instance: QuestionInstance = {
        id: idGen(),
        sessionItemId: cmd.sessionItemId,
        knowledgePointId: kp.id,
        templateId: template.id,
        sequence,
        generatedAt: now(),
      };

      await questions.saveInstance(instance);

      // 回写 SessionItem.questionInstanceId，闭合题目链路（P1-9）
      const sessionItem = await sessionItems.findById(cmd.sessionItemId);
      if (sessionItem) {
        await sessionItems.save({ ...sessionItem, questionInstanceId: instance.id });
      }

      // 即时渲染题目（§4 确定性生成优先；§6 注册表分发）。
      // 未提供 registry（旧调用方）则只返回实例指针。
      let question: RenderedQuestion | null = null;
      if (entry) {
        const siblings = this.deps.findSiblings
          ? await this.deps.findSiblings(kp.id, kp.type)
          : undefined;
        question = await entry.generator.generate({
          knowledgePoint: kp,
          template,
          sequence,
          siblings,
          synonyms: this.deps.synonyms,
        });
      }

      return { instance, question };
    });
  }
}
