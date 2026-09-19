/**
 * CompleteSession / AbandonSession Use Case —— 会话结束（架构文档 §36 状态机）。
 * 仅允许 active → completed / active → abandoned；禁止 completed → active。
 */

import { ForbiddenError, InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudySession } from "../domain/session";
import { canTransitionSession } from "../domain/session";
import type { LearningRepositories } from "../domain/repositories";

export interface EndSessionDeps {
  repos: LearningRepositories;
  uow: UnitOfWork;
  /** 可注入时钟（测试用） */
  now?: () => Date;
  /** 按用户时区计算本地日期 "YYYY-MM-DD"（BR-061 / BR-093），与 FinalizeReview 一致 */
  getLocalDate: (userId: string, now: Date) => Promise<string>;
}

export interface EndSessionCommand {
  sessionId: string;
  /** 调用方身份：事务内校验 session.userId === cmd.userId，否则 ForbiddenError（Phase 8 越权补强） */
  userId: string;
}

export interface EndSessionResult {
  session: StudySession;
}

async function endSession(
  deps: EndSessionDeps,
  cmd: EndSessionCommand,
  to: "completed" | "abandoned"
): Promise<EndSessionResult> {
  const { repos, uow } = deps;
  const now = deps.now ?? (() => new Date());

  return uow.transaction(async () => {
    const session = await repos.sessions.findById(cmd.sessionId);
    if (!session) {
      throw new NotFoundError(`Session ${cmd.sessionId} 不存在`);
    }
    if (session.userId !== cmd.userId) {
      throw new ForbiddenError("无权结束他人的 Session");
    }
    if (!canTransitionSession(session.status, to)) {
      throw new InvalidStateTransitionError(
        `Session 当前状态 ${session.status}，只能结束 active 会话`
      );
    }

    const endedAt = now();
    const ended: StudySession = {
      ...session,
      status: to,
      endedAt,
      durationSeconds: Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000)),
    };
    await repos.sessions.save(ended);

    // completedSessionCount 只在 completed 时 +1；abandoned 不累加（BR-070/071）
    if (to === "completed") {
      const localDate = await deps.getLocalDate(session.userId, endedAt);
      const day = await repos.studyDays.find(session.userId, localDate);
      await repos.studyDays.upsert({
        id: day?.id ?? crypto.randomUUID(),
        userId: session.userId,
        localDate,
        minutes: (day?.minutes ?? 0) + Math.round(ended.durationSeconds / 60),
        attemptCount: day?.attemptCount ?? 0,
        correctCount: day?.correctCount ?? 0,
        reviewCount: day?.reviewCount ?? 0,
        newCount: day?.newCount ?? 0,
        completedSessionCount: (day?.completedSessionCount ?? 0) + 1,
      });
    }

    return { session: ended };
  });
}

export class CompleteSession {
  constructor(private readonly deps: EndSessionDeps) {}
  execute(cmd: EndSessionCommand): Promise<EndSessionResult> {
    return endSession(this.deps, cmd, "completed");
  }
}

export class AbandonSession {
  constructor(private readonly deps: EndSessionDeps) {}
  execute(cmd: EndSessionCommand): Promise<EndSessionResult> {
    return endSession(this.deps, cmd, "abandoned");
  }
}
