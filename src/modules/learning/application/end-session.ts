/**
 * CompleteSession / AbandonSession Use Case —— 会话结束（架构文档 §36 状态机）。
 * 仅允许 active → completed / active → abandoned；禁止 completed → active。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudySession } from "../domain/session";
import type { LearningRepositories } from "../domain/repositories";

export interface EndSessionDeps {
  repos: LearningRepositories;
  uow: UnitOfWork;
  now?: () => Date;
}

export interface EndSessionCommand {
  sessionId: string;
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
    if (session.status !== "active") {
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
