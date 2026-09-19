/**
 * NextSessionItem Use Case —— 取下一项（POST /api/sessions/:id/items 背后的领域用例，Phase 8）。
 *
 * 入参：{ sessionId, userId }
 * 规则：
 *   1. Session 必须存在（否则 NotFoundError）
 *   2. 归属校验：session.userId === cmd.userId，否则 ForbiddenError（与 Resume/Submit 一致）
 *   3. 仅 active 会话能取下一项（否则 InvalidStateTransitionError）
 *   4. 按 position 升序找第一个 pending 的 SessionItem：
 *      - 经 canTransitionSessionItem 守卫 pending → active 并持久化；
 *      - 返回 { session, item, questionInstanceId }。
 *   5. 没有 pending 项（全部 completed/skipped/active）→ item=null, questionInstanceId=null。
 *
 * 状态机纪律：completed/skipped 是终态，绝不当作 next；active 是"进行中"，
 * 本用例只负责把"下一个 pending"激活，不重复激活已 active 的项（由 Resume/Submit 路径处理）。
 */

import {
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { StudySession, SessionItem } from "../domain/session";
import { canTransitionSessionItem } from "../domain/session";
import type { LearningRepositories } from "../domain/repositories";

export interface NextSessionItemDeps {
  repos: LearningRepositories;
  uow: UnitOfWork;
}

export interface NextSessionItemCommand {
  sessionId: string;
  userId: string;
}

export interface NextSessionItemResult {
  session: StudySession;
  /** 激活后的下一项；无 pending 项时为 null */
  item: SessionItem | null;
  /** 透传 item.questionInstanceId；item 为 null 时为 null */
  questionInstanceId: string | null;
}

export class NextSessionItem {
  constructor(private readonly deps: NextSessionItemDeps) {}

  async execute(cmd: NextSessionItemCommand): Promise<NextSessionItemResult> {
    const { repos, uow } = this.deps;

    return uow.transaction(async () => {
      const session = await repos.sessions.findById(cmd.sessionId);
      if (!session) {
        throw new NotFoundError(`Session ${cmd.sessionId} 不存在`);
      }
      if (session.userId !== cmd.userId) {
        throw new ForbiddenError("无权访问他人的 Session");
      }
      if (session.status !== "active") {
        throw new InvalidStateTransitionError(
          `Session 状态为 ${session.status}，只有 active 会话能取下一项`
        );
      }

      const items = (await repos.sessionItems.findBySession(session.id)).sort(
        (a, b) => a.position - b.position
      );

      // 第一个 pending 项；completed/skipped 是终态、active 是进行中，都不在这里"新取下"。
      const next = items.find((i) => i.status === "pending") ?? null;
      if (!next) {
        return { session, item: null, questionInstanceId: null };
      }

      // 唯一真源守卫：pending → active。理论上 find 已限定 pending，这里再兜一层状态机。
      if (!canTransitionSessionItem(next.status, "active")) {
        throw new InvalidStateTransitionError(
          `SessionItem 当前状态 ${next.status}，不能置为 active`
        );
      }

      const activated: SessionItem = { ...next, status: "active" };
      await repos.sessionItems.save(activated);

      return {
        session,
        item: activated,
        questionInstanceId: activated.questionInstanceId,
      };
    });
  }
}
