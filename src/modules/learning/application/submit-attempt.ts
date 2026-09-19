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
  ContentNotPublishedError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { Attempt } from "../domain/attempt";
import { createImmutableAttempt } from "../domain/attempt";
import { canTransitionSessionItem } from "../domain/session";
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

/**
 * 判断是否为数据库唯一约束冲突（Prisma P2002）。
 * 不直接 import @prisma/client，改用结构化识别，使本用例对仓储实现保持中立：
 * 任何抛错对象只要带有 code === "P2002"（或 name 为 PrismaClientKnownRequestError）即视为兜底命中。
 */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; name?: unknown };
  return e.code === "P2002" || e.name === "PrismaClientKnownRequestError";
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
        throw new ForbiddenError("无权访问他人的 Session");
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

      const kp = await knowledgePoints.findById(sessionItem.knowledgePointId);
      if (!kp) {
        throw new NotFoundError("KnowledgePoint 不存在");
      }
      if (kp.status !== "published") {
        throw new ContentNotPublishedError("KnowledgePoint 未发布");
      }

      const submittedAt = now();
      // Attempt 是事实记录：经不可变工厂冻结，落库后不得被悄悄改写（BR-003）
      const attempt: Attempt = createImmutableAttempt({
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
      });

      // ── 幂等写入（BR-012）──────────────────────────────────────────────
      // TOCTOU 说明：上方 findByClientRequestId 与下方 save 之间存在时间窗口，
      // 两个并发请求可能都查不到 existing、同时尝试插入。应用层查不到不等于
      // 真正唯一——并发冲突由数据库唯一约束兜底：Attempt 模型有
      // @@unique([userId, clientRequestId])（见 prisma/schema.prisma）。
      // 因此这里捕获 DB 的 unique violation（Prisma P2002），重查一次并以幂等结果
      // （created:false）返回，而不是把原始数据库错误抛给调用方。
      try {
        await repos.attempts.save(attempt);
      } catch (err) {
        if (isUniqueViolation(err)) {
          const raced = await repos.attempts.findByClientRequestId(
            cmd.userId,
            cmd.clientRequestId
          );
          if (raced) {
            return { created: false, attempt: raced };
          }
        }
        throw err;
      }

      // SessionItem：pending → active（状态机守卫；已 active/completed/skipped 保持不变）
      if (canTransitionSessionItem(sessionItem.status, "active")) {
        await repos.sessionItems.save({ ...sessionItem, status: "active" });
      }

      return { created: true, attempt };
    });
  }
}
