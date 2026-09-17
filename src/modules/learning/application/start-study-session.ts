/**
 * StartStudySession Use Case —— 建立一次有边界的学习活动（架构文档 §21 / BR-050）。
 * Session 拥有时间与模式；SessionItem 按给定知识点列表构建（pending）。
 */

import { NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { StudySession, SessionItem, StudySessionMode } from "../domain/session";
import type { LearningRepositories } from "../domain/repositories";

export interface StartStudySessionDeps {
  repos: LearningRepositories;
  knowledgePoints: KnowledgePointRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface StartStudySessionCommand {
  userId: string;
  subjectId: string;
  mode?: StudySessionMode;
  knowledgePointIds: string[];
}

export interface StartStudySessionResult {
  session: StudySession;
  items: SessionItem[];
}

function randomId(): string {
  return crypto.randomUUID();
}

export class StartStudySession {
  constructor(private readonly deps: StartStudySessionDeps) {}

  async execute(cmd: StartStudySessionCommand): Promise<StartStudySessionResult> {
    const { repos, knowledgePoints, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    if (cmd.knowledgePointIds.length === 0) {
      throw new ValidationError("学习会话至少需要一个知识点");
    }

    return uow.transaction(async () => {
      // 校验知识点全部存在且已发布
      for (const kpId of cmd.knowledgePointIds) {
        const kp = await knowledgePoints.findPublishedById(kpId);
        if (!kp) {
          throw new NotFoundError(`KnowledgePoint ${kpId} 不存在或未发布`);
        }
      }

      const startedAt = now();
      const session: StudySession = {
        id: idGen(),
        userId: cmd.userId,
        subjectId: cmd.subjectId,
        mode: cmd.mode ?? "daily",
        startedAt,
        endedAt: null,
        status: "active",
        durationSeconds: 0,
      };

      const items: SessionItem[] = cmd.knowledgePointIds.map((kpId, index) => ({
        id: idGen(),
        sessionId: session.id,
        knowledgePointId: kpId,
        position: index,
        status: "pending",
        questionInstanceId: null,
      }));

      await repos.sessions.save(session);
      for (const item of items) {
        await repos.sessionItems.save(item);
      }

      return { session, items };
    });
  }
}
