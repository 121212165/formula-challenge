/**
 * SubmitAttempt Use Case —— 记录一次真实作答（BR-003 / BR-012）。
 *
 * 输入：sessionItemId + userAnswer + clientRequestId
 * 规则：
 *   1. clientRequestId 幂等：同一用户同一 clientRequestId 只产生一个 Attempt（BR-012）
 *   2. SessionItem 必须存在且属于一个 active 的 Session（BR-051）
 *   3. QuestionInstance 必须存在且属于该 SessionItem
 *   4. KnowledgePoint 必须存在且已发布（published）
 *   5. 创建的 Attempt 状态为 submitted
 */

import {
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { Attempt } from "../domain/attempt";
import type { LearningRepositories } from "../domain/repositories";
import type { QuestionRepository } from "@/modules/question/domain/question-repository";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";

export interface SubmitAttemptDeps {
  repos: LearningRepositories;
  questions: QuestionRepository;
  knowledgePoints: KnowledgePointRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface SubmitAttemptCommand {
  userId: string;
  sessionItemId: string;
  userAnswer: string;
  clientRequestId: string;
  startedAt: Date;
}

export interface SubmitAttemptResult {
  /** true = 新提交；false = clientRequestId 幂等命中 */
  created: boolean;
  attempt: Attempt;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class SubmitAttempt {
  constructor(private readonly deps: SubmitAttemptDeps) {}

  async execute(cmd: SubmitAttemptCommand): Promise<SubmitAttemptResult> {
    const { repos, questions, knowledgePoints, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      // 幂等：同一 clientRequestId 已存在 → 返回已有 Attempt（BR-012）
      const existing = await repos.attempts.findByClientRequestId(cmd.userId, cmd.clientRequestId);
      if (existing) {
        return { created: false, attempt: existing };
      }

      const sessionItem = await repos.sessionItems.findById(cmd.sessionItemId);
      if (!sessionItem) {
        throw new NotFoundError(`SessionItem ${cmd.sessionItemId} 不存在`);
      }

      const session = await repos.sessions.findById(sessionItem.sessionId);
      if (!session) {
        throw new NotFoundError(`Session ${sessionItem.sessionId} 不存在`);
      }
      if (session.userId !== cmd.userId) {
        throw new InvalidStateTransitionError("Session 不属于该用户");
      }
      if (session.status !== "active") {
        throw new InvalidStateTransitionError(
          `Session 状态为 ${session.status}，只有 active 才能作答`
        );
      }

      const instance = await questions.findInstanceById(sessionItem.questionInstanceId ?? "");
      if (!instance || instance.sessionItemId !== sessionItem.id) {
        throw new NotFoundError("SessionItem 尚未生成题目实例");
      }

      const kp = await knowledgePoints.findPublishedById(sessionItem.knowledgePointId);
      if (!kp) {
        throw new NotFoundError("KnowledgePoint 不存在或未发布");
      }

      const submittedAt = now();
      const attempt: Attempt = {
        id: idGen(),
        userId: cmd.userId,
        sessionId: session.id,
        sessionItemId: sessionItem.id,
        questionInstanceId: instance.id,
        knowledgePointId: sessionItem.knowledgePointId,
        userAnswer: cmd.userAnswer,
        startedAt: cmd.startedAt,
        submittedAt,
        timeSpentSeconds: Math.max(0, Math.round((submittedAt.getTime() - cmd.startedAt.getTime()) / 1000)),
        status: "submitted",
        clientRequestId: cmd.clientRequestId,
      };

      await repos.attempts.save(attempt);

      // SessionItem：pending → active（已 active 保持不变）
      if (sessionItem.status === "pending") {
        await repos.sessionItems.save({ ...sessionItem, status: "active" });
      }

      return { created: true, attempt };
    });
  }
}
