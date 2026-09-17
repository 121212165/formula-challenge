/**
 * ResumeSession Use Case —— 恢复会话（架构文档 §50 Scenario 04）。
 * 返回 active 会话及其未完成 items；已结束会话抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { StudySession, SessionItem } from "../domain/session";
import type { LearningRepositories } from "../domain/repositories";

export interface ResumeSessionDeps {
  repos: LearningRepositories;
}

export interface ResumeSessionCommand {
  sessionId: string;
  userId: string;
}

export interface ResumeSessionResult {
  session: StudySession;
  items: SessionItem[];
  /** 下一个待完成的 item（无则 null） */
  nextItem: SessionItem | null;
}

export class ResumeSession {
  constructor(private readonly deps: ResumeSessionDeps) {}

  async execute(cmd: ResumeSessionCommand): Promise<ResumeSessionResult> {
    const { repos } = this.deps;

    const session = await repos.sessions.findById(cmd.sessionId);
    if (!session) {
      throw new NotFoundError(`Session ${cmd.sessionId} 不存在`);
    }
    if (session.userId !== cmd.userId) {
      throw new NotFoundError(`Session ${cmd.sessionId} 不存在`);
    }
    if (session.status !== "active") {
      throw new InvalidStateTransitionError(
        `Session 状态为 ${session.status}，只有 active 会话可恢复`
      );
    }

    const items = (await repos.sessionItems.findBySession(session.id)).sort(
      (a, b) => a.position - b.position
    );
    const pending = items.filter(
      (i) => i.status === "pending" || i.status === "active"
    );

    return { session, items, nextItem: pending[0] ?? null };
  }
}
