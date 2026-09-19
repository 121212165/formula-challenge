/**
 * EvaluateAttempt Use Case —— 系统评价一次作答（BR-022）。
 *
 * 规则：
 *   1. Attempt 必须存在
 *   2. Attempt 必须 submitted（BR-013：submitted → evaluated）
 *   3. 一个 Attempt 最多一个 Evaluation（幂等：已评价直接返回）
 *   4. Evaluator 输出 EvaluationResult，不直接触碰 LearningState（BR-022）
 *   5. 保存 Evaluation 后 Attempt 状态推进到 evaluated
 */

import {
  ContentNotPublishedError,
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { LearningRepositories } from "../domain/repositories";
import { canTransitionAttempt } from "../domain/attempt";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { QuestionRepository } from "@/modules/question/domain/question-repository";
import type { Evaluator } from "./evaluator";

export interface EvaluateAttemptDeps {
  repos: LearningRepositories;
  knowledgePoints: KnowledgePointRepository;
  questions: QuestionRepository;
  evaluator: Evaluator;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface EvaluateAttemptCommand {
  attemptId: string;
}

export interface EvaluateAttemptResult {
  /** true = 新评价；false = 幂等命中已有评价 */
  created: boolean;
  score: number;
  isCorrect: boolean;
  feedback: string | null;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class EvaluateAttempt {
  constructor(private readonly deps: EvaluateAttemptDeps) {}

  async execute(cmd: EvaluateAttemptCommand): Promise<EvaluateAttemptResult> {
    const { repos, knowledgePoints, questions, evaluator, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const attempt = await repos.attempts.findById(cmd.attemptId);
      if (!attempt) {
        throw new NotFoundError(`Attempt ${cmd.attemptId} 不存在`);
      }

      // 幂等：已有 Evaluation 直接返回
      const existingEvaluation = await repos.evaluations.findByAttemptId(attempt.id);
      if (existingEvaluation) {
        return {
          created: false,
          score: existingEvaluation.score,
          isCorrect: existingEvaluation.isCorrect,
          feedback: existingEvaluation.feedback,
        };
      }

      // 状态机：只能评价 submitted 的 Attempt（BR-013）
      if (!canTransitionAttempt(attempt.status, "evaluated")) {
        throw new InvalidStateTransitionError(
          `Attempt 当前状态 ${attempt.status}，必须 submitted 后才能评价`
        );
      }

      const kp = await knowledgePoints.findById(attempt.knowledgePointId);
      if (!kp) {
        throw new NotFoundError("KnowledgePoint 不存在");
      }
      if (kp.status !== "published") {
        throw new ContentNotPublishedError("KnowledgePoint 未发布");
      }

      const instance = await questions.findInstanceById(attempt.questionInstanceId);
      if (!instance) {
        throw new NotFoundError("QuestionInstance 不存在");
      }
      const template = await questions.findTemplateById(instance.templateId);
      // §3.4：缺模板必须显式报错，不得静默退化为 free_recall
      if (!template) {
        throw new NotFoundError(
          `QuestionTemplate ${instance.templateId} 不存在（缺模板不得静默退化为 free_recall）`
        );
      }
      const questionType = template.type;

      const result = await evaluator.evaluate({
        knowledgePoint: kp,
        questionType,
        userAnswer: attempt.userAnswer,
        // 把模板 config 与题号下传，支撑 fill_blank 复算挖空、recognition 精确比对
        templateConfig: template.config,
        instanceSequence: instance.sequence,
      });

      await repos.evaluations.save({
        id: idGen(),
        attemptId: attempt.id,
        score: result.score,
        isCorrect: result.isCorrect,
        confidence: result.confidence,
        feedback: result.feedback,
        createdAt: now(),
      });
      await repos.attempts.updateStatus(attempt.id, "evaluated");

      return {
        created: true,
        score: result.score,
        isCorrect: result.isCorrect,
        feedback: result.feedback,
      };
    });
  }
}
