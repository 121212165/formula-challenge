/**
 * Phase 8 Session 核心补强集成测试（领域用例 + 内存仓储 + Noop UoW）。
 *
 * 覆盖 hint 要求的四项：
 *  1. ResumeSession 越权：session 存在但 userId 不匹配 → ForbiddenError（不是 NotFound）；真不存在 → NotFoundError。
 *  2. EndSession（Complete/Abandon）：命令新增 userId，事务内归属校验，他人 session → ForbiddenError。
 *  3. NextSessionItem：取下一项 pending→active（经 canTransitionSessionItem），completed/skipped 不当 next，无 pending → null。
 *  4. Resume 不变式：active 会话 + 混合 item（pending/active/completed）+ Attempt 历史，Resume 后状态不变、历史完整、nextItem 正确。
 *
 * 与 session-plan-contract.test.ts 同一装配范式（createInMemoryRepos + createNoopUnitOfWork），
 * 用最小读方法（直接读 store.attempts）按 sessionId 校验 Attempt 历史。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
} from "@/shared/errors";
import { ResumeSession } from "@/modules/learning/application/resume-session";
import { CompleteSession, AbandonSession } from "@/modules/learning/application/end-session";
import { NextSessionItem } from "@/modules/learning/application/next-session-item";
import type {
  StudySessionStatus,
  SessionItemStatus,
} from "@/modules/learning/domain/session";
import {
  createInMemoryRepos,
  createInMemoryStore,
  type InMemoryStore,
} from "@/tests/e2e/helpers/in-memory-repos";
import { createNoopUnitOfWork } from "@/tests/e2e/helpers/noop-unit-of-work";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { Attempt } from "@/modules/learning/domain/attempt";

const USER_ID = "user-001";
const OTHER_USER = "user-002";
const NOW = new Date("2026-09-18T08:00:00.000Z");
const LOCAL_DATE = "2026-09-18";

function makeUow(): UnitOfWork {
  return createNoopUnitOfWork();
}

type Repos = ReturnType<typeof createInMemoryRepos>;

/** 直接种一条 active/指定状态的 Session 及其 items（绕过 StartStudySession，便于构造混合状态）。 */
async function seedSession(
  repos: Repos,
  opts: {
    id: string;
    userId: string;
    status?: StudySessionStatus;
    items: Array<{
      id: string;
      position: number;
      status: SessionItemStatus;
      knowledgePointId?: string;
      questionInstanceId?: string | null;
    }>;
  }
) {
  await repos.sessions.save({
    id: opts.id,
    userId: opts.userId,
    subjectId: "formula",
    mode: "daily",
    startedAt: NOW,
    endedAt: opts.status && opts.status !== "active" ? NOW : null,
    status: opts.status ?? "active",
    durationSeconds: 0,
  });
  for (const it of opts.items) {
    await repos.sessionItems.save({
      id: it.id,
      sessionId: opts.id,
      knowledgePointId: it.knowledgePointId ?? "kp-1",
      position: it.position,
      status: it.status,
      questionInstanceId: it.questionInstanceId ?? null,
    });
  }
}

/** 种一条 Attempt 事实（最小字段集，复用内存仓储）。 */
function makeAttempt(partial: Partial<Attempt> & Pick<Attempt, "id" | "sessionId" | "sessionItemId">): Attempt {
  return {
    userId: USER_ID,
    questionInstanceId: "qi-x",
    knowledgePointId: "kp-1",
    userAnswer: "x",
    startedAt: NOW,
    submittedAt: NOW,
    timeSpentSeconds: 1,
    status: "submitted",
    clientRequestId: `cr-${partial.id}`,
    ...partial,
  };
}

describe("Phase8-1 ResumeSession 越权：存在但无权 → ForbiddenError，真不存在 → NotFoundError", () => {
  let store: InMemoryStore;
  let repos: Repos;

  beforeEach(() => {
    store = createInMemoryStore();
    repos = createInMemoryRepos(store);
  });

  it("本人恢复成功；他人恢复抛 ForbiddenError；真不存在抛 NotFoundError", async () => {
    await seedSession(repos, {
      id: "sess-a",
      userId: USER_ID,
      items: [{ id: "it-1", position: 0, status: "pending" }],
    });

    const resume = new ResumeSession({ repos });

    // 本人：active 会话正常恢复
    const own = await resume.execute({ sessionId: "sess-a", userId: USER_ID });
    expect(own.session.status).toBe("active");
    expect(own.items).toHaveLength(1);

    // 他人：会话真实存在但归属他人 → ForbiddenError（不再是 NotFoundError）
    await expect(
      resume.execute({ sessionId: "sess-a", userId: OTHER_USER })
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 真不存在 → NotFoundError（二者语义区分）
    await expect(
      resume.execute({ sessionId: "sess-not-exists", userId: USER_ID })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Phase8-2 EndSession（Complete/Abandon）事务内 userId 归属校验", () => {
  let store: InMemoryStore;
  let repos: Repos;

  beforeEach(() => {
    store = createInMemoryStore();
    repos = createInMemoryRepos(store);
  });

  it("他人不能 Complete；他人不能 Abandon；本人可正常结束", async () => {
    await seedSession(repos, {
      id: "sess-b",
      userId: USER_ID,
      items: [{ id: "it-1", position: 0, status: "pending" }],
    });

    const deps = {
      repos,
      uow: makeUow(),
      now: () => NOW,
      getLocalDate: async () => LOCAL_DATE,
    };

    // 他人 Complete → ForbiddenError
    const complete = new CompleteSession(deps);
    await expect(
      complete.execute({ sessionId: "sess-b", userId: OTHER_USER })
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 他人 Abandon → ForbiddenError
    const abandon = new AbandonSession(deps);
    await expect(
      abandon.execute({ sessionId: "sess-b", userId: OTHER_USER })
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 本人 Complete → completed（正向通路）
    const done = await complete.execute({ sessionId: "sess-b", userId: USER_ID });
    expect(done.session.status).toBe("completed");
  });
});

describe("Phase8-3 NextSessionItem：取下一项 pending→active，状态机纪律", () => {
  let store: InMemoryStore;
  let repos: Repos;

  beforeEach(() => {
    store = createInMemoryStore();
    repos = createInMemoryRepos(store);
  });

  it("按 position 取第一个 pending，pending→active 并持久化，返回 questionInstanceId", async () => {
    await seedSession(repos, {
      id: "sess-c",
      userId: USER_ID,
      items: [
        { id: "it-done", position: 0, status: "completed", questionInstanceId: "qi-done" },
        { id: "it-next", position: 1, status: "pending", questionInstanceId: "qi-next" },
        { id: "it-tail", position: 2, status: "pending", questionInstanceId: "qi-tail" },
      ],
    });

    const uc = new NextSessionItem({ repos, uow: makeUow() });
    const res = await uc.execute({ sessionId: "sess-c", userId: USER_ID });

    // 选中的是 position=1 的 pending，不是 position=0 的 completed
    expect(res.item?.id).toBe("it-next");
    expect(res.item?.status).toBe("active");
    expect(res.questionInstanceId).toBe("qi-next");

    // 持久化：it-next 已 active；it-done 仍 completed（终态不动）
    const afterNext = await repos.sessionItems.findById("it-next");
    expect(afterNext?.status).toBe("active");
    expect((await repos.sessionItems.findById("it-done"))?.status).toBe("completed");
  });

  it("completed/skipped 不当 next：第一个是 skipped，应跳过并取下一个 pending", async () => {
    await seedSession(repos, {
      id: "sess-d",
      userId: USER_ID,
      items: [
        { id: "it-skip", position: 0, status: "skipped" },
        { id: "it-pend", position: 1, status: "pending" },
      ],
    });

    const uc = new NextSessionItem({ repos, uow: makeUow() });
    const res = await uc.execute({ sessionId: "sess-d", userId: USER_ID });

    expect(res.item?.id).toBe("it-pend");
    expect(res.item?.status).toBe("active");
    // skipped 终态不被改动
    expect((await repos.sessionItems.findById("it-skip"))?.status).toBe("skipped");
  });

  it("没有 pending 项（全为 completed/skipped）→ item=null, questionInstanceId=null", async () => {
    await seedSession(repos, {
      id: "sess-e",
      userId: USER_ID,
      items: [
        { id: "it-done", position: 0, status: "completed" },
        { id: "it-skip", position: 1, status: "skipped" },
      ],
    });

    const uc = new NextSessionItem({ repos, uow: makeUow() });
    const res = await uc.execute({ sessionId: "sess-e", userId: USER_ID });

    expect(res.item).toBeNull();
    expect(res.questionInstanceId).toBeNull();
  });

  it("他人 session 取下一项 → ForbiddenError；非 active 会话 → InvalidStateTransitionError", async () => {
    await seedSession(repos, {
      id: "sess-f",
      userId: USER_ID,
      items: [{ id: "it-1", position: 0, status: "pending" }],
    });
    await seedSession(repos, {
      id: "sess-g",
      userId: USER_ID,
      status: "completed",
      items: [{ id: "it-2", position: 0, status: "completed" }],
    });

    const uc = new NextSessionItem({ repos, uow: makeUow() });

    // 越权
    await expect(
      uc.execute({ sessionId: "sess-f", userId: OTHER_USER })
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 会话已 completed，不能取下一项
    await expect(
      uc.execute({ sessionId: "sess-g", userId: USER_ID })
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe("Phase8-4 Resume 不变式：混合 item + Attempt 历史，Resume 后状态与历史不变", () => {
  let store: InMemoryStore;
  let repos: Repos;

  beforeEach(() => {
    store = createInMemoryStore();
    repos = createInMemoryRepos(store);
  });

  it("completed 仍 completed、pending 仍 pending、Attempt 历史完整、nextItem 是第一个 pending/active", async () => {
    // active 会话：pos0 completed（已作答并复习完）、pos1 active（作答中）、pos2 pending
    await seedSession(repos, {
      id: "sess-inv",
      userId: USER_ID,
      items: [
        { id: "it-a", position: 0, status: "completed", knowledgePointId: "kp-1", questionInstanceId: "qi-a" },
        { id: "it-b", position: 1, status: "active", knowledgePointId: "kp-2", questionInstanceId: "qi-b" },
        { id: "it-c", position: 2, status: "pending", knowledgePointId: "kp-3", questionInstanceId: null },
      ],
    });

    // Attempt 历史：两个 Attempt 分属 it-a / it-b
    await repos.attempts.save(
      makeAttempt({ id: "att-a", sessionId: "sess-inv", sessionItemId: "it-a", knowledgePointId: "kp-1", questionInstanceId: "qi-a", clientRequestId: "cr-att-a" })
    );
    await repos.attempts.save(
      makeAttempt({ id: "att-b", sessionId: "sess-inv", sessionItemId: "it-b", knowledgePointId: "kp-2", questionInstanceId: "qi-b", clientRequestId: "cr-att-b" })
    );

    const resume = new ResumeSession({ repos });
    const result = await resume.execute({ sessionId: "sess-inv", userId: USER_ID });

    // 1) 返回的 item 状态保持不变式
    const byId = new Map(result.items.map((i) => [i.id, i]));
    expect(byId.get("it-a")?.status).toBe("completed");
    expect(byId.get("it-b")?.status).toBe("active");
    expect(byId.get("it-c")?.status).toBe("pending");

    // 2) 持久层也未被 Resume 改写（Resume 是读路径，不应改写 item）
    expect((await repos.sessionItems.findById("it-a"))?.status).toBe("completed");
    expect((await repos.sessionItems.findById("it-b"))?.status).toBe("active");
    expect((await repos.sessionItems.findById("it-c"))?.status).toBe("pending");

    // 3) nextItem：按 position 第一个 pending/active → pos1 的 it-b（pos0 completed 被过滤）
    expect(result.nextItem?.id).toBe("it-b");
    expect(result.nextItem?.status).toBe("active");

    // 4) Attempt 历史完整：按 sessionId 读出两条，归属/字段不丢
    const history = [...store.attempts.values()].filter((a) => a.sessionId === "sess-inv");
    expect(history).toHaveLength(2);
    const histById = new Map(history.map((a) => [a.id, a]));
    expect(histById.get("att-a")?.sessionItemId).toBe("it-a");
    expect(histById.get("att-a")?.knowledgePointId).toBe("kp-1");
    expect(histById.get("att-b")?.sessionItemId).toBe("it-b");
    expect(histById.get("att-b")?.clientRequestId).toBe("cr-att-b");
  });
});
