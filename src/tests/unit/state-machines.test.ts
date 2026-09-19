/**
 * 状态机守卫函数单元测试（P1-1 ~ P1-5 / 架构文档 §24 §31 §36）。
 *
 * 全部为 domain 层纯函数：canTransitionX(from, to) => boolean。
 * 这里枚举每个状态机的全部 (from, to) 组合，断言合法路径放行、非法路径拒绝。
 */
import { describe, it, expect } from "vitest";
import { canTransitionContent, isContentVisible } from "@/modules/content/domain/content";
import { canTransitionPlan } from "@/modules/study-plan/domain/study-plan";
import { canTransitionAttempt } from "@/modules/learning/domain/attempt";
import {
  canTransitionSession,
  canTransitionSessionItem,
} from "@/modules/learning/domain/session";

describe("canTransitionContent —— ContentItem 状态机", () => {
  const states = ["draft", "review", "published", "archived"] as const;
  // 合法路径（架构文档 §31）：draft→review→published→archived，可在 review 回退 draft、published 回退 review。
  const legal = new Set([
    "draft->review",
    "review->draft",
    "review->published",
    "published->review",
    "published->archived",
    "archived->published",
  ]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 的合法性与白名单一致",
    ({ from, to }) => {
      expect(canTransitionContent(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("禁止 draft → published 直通（必须经过 review）", () => {
    expect(canTransitionContent("draft", "published")).toBe(false);
  });

  it("禁止 draft → archived 直跳，也不允许 archived → draft 回退", () => {
    expect(canTransitionContent("draft", "archived")).toBe(false);
    expect(canTransitionContent("archived", "draft")).toBe(false);
  });

  it("不允许任何自环（状态保持不变不算迁移）", () => {
    for (const s of states) {
      expect(canTransitionContent(s, s)).toBe(false);
    }
  });

  it("published 可回退 review 修订，也可归档；review 可被驳回回 draft", () => {
    expect(canTransitionContent("published", "review")).toBe(true);
    expect(canTransitionContent("published", "archived")).toBe(true);
    expect(canTransitionContent("review", "draft")).toBe(true);
  });
});

describe("canTransitionPlan —— StudyPlan 状态机", () => {
  const states = ["draft", "active", "completed", "expired"] as const;
  // 合法路径（架构文档 §24）：draft→active→completed；active→expired。completed/expired 为终态。
  const legal = new Set([
    "draft->active",
    "active->completed",
    "active->expired",
  ]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 的合法性与白名单一致",
    ({ from, to }) => {
      expect(canTransitionPlan(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("生成即 active 被禁止：draft 只能先进到 active，不能直接 completed/expired", () => {
    expect(canTransitionPlan("draft", "active")).toBe(true);
    expect(canTransitionPlan("draft", "completed")).toBe(false);
    expect(canTransitionPlan("draft", "expired")).toBe(false);
  });

  it("completed 与 expired 是终态，不能再迁移", () => {
    for (const to of states) {
      expect(canTransitionPlan("completed", to)).toBe(false);
      expect(canTransitionPlan("expired", to)).toBe(false);
    }
  });

  it("不允许回退（active 不能回到 draft，completed 不能回到 active）", () => {
    expect(canTransitionPlan("active", "draft")).toBe(false);
    expect(canTransitionPlan("completed", "active")).toBe(false);
  });
});

describe("canTransitionAttempt —— Attempt 状态机", () => {
  const states = ["submitted", "evaluated", "reviewed"] as const;
  // 严格线性 order：submitted(0) → evaluated(1) → reviewed(2)，仅允许 +1。
  const legal = new Set(["submitted->evaluated", "evaluated->reviewed"]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 仅允许严格线性 +1",
    ({ from, to }) => {
      expect(canTransitionAttempt(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("禁止跳步：submitted 不能直接到 reviewed", () => {
    expect(canTransitionAttempt("submitted", "reviewed")).toBe(false);
  });

  it("禁止回退：evaluated 不能回到 submitted", () => {
    expect(canTransitionAttempt("evaluated", "submitted")).toBe(false);
  });

  it("reviewed 为终态，且不允许自环", () => {
    expect(canTransitionAttempt("reviewed", "reviewed")).toBe(false);
    expect(canTransitionAttempt("reviewed", "evaluated")).toBe(false);
    expect(canTransitionAttempt("submitted", "submitted")).toBe(false);
  });
});

describe("canTransitionSession —— StudySession 状态机", () => {
  const states = ["active", "completed", "abandoned"] as const;
  const legal = new Set(["active->completed", "active->abandoned"]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 的合法性与白名单一致",
    ({ from, to }) => {
      expect(canTransitionSession(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("active 可正常结束或中途放弃", () => {
    expect(canTransitionSession("active", "completed")).toBe(true);
    expect(canTransitionSession("active", "abandoned")).toBe(true);
  });

  it("已结束/已放弃的会话不能再回到 active（架构文档 §36）", () => {
    expect(canTransitionSession("completed", "active")).toBe(false);
    expect(canTransitionSession("abandoned", "active")).toBe(false);
  });

  it("completed 与 abandoned 之间不能互转，也不能自环", () => {
    expect(canTransitionSession("completed", "abandoned")).toBe(false);
    expect(canTransitionSession("abandoned", "completed")).toBe(false);
    expect(canTransitionSession("completed", "completed")).toBe(false);
  });
});

describe("canTransitionSessionItem —— SessionItem 状态机", () => {
  const states = ["pending", "active", "completed", "skipped"] as const;
  // 合法路径：pending→active→completed；pending/active 均可→skipped。completed/skipped 终态。
  const legal = new Set([
    "pending->active",
    "pending->skipped",
    "active->completed",
    "active->skipped",
  ]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 的合法性与白名单一致",
    ({ from, to }) => {
      expect(canTransitionSessionItem(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("禁止 pending → completed 直跳（必须先 active）", () => {
    expect(canTransitionSessionItem("pending", "completed")).toBe(false);
  });

  it("pending 与 active 都允许被跳过（skipped）", () => {
    expect(canTransitionSessionItem("pending", "skipped")).toBe(true);
    expect(canTransitionSessionItem("active", "skipped")).toBe(true);
  });

  it("completed 与 skipped 为终态，不能再迁移", () => {
    for (const to of states) {
      expect(canTransitionSessionItem("completed", to)).toBe(false);
      expect(canTransitionSessionItem("skipped", to)).toBe(false);
    }
  });

  it("isContentVisible 与 session 状态机同属核心可见性不变量：仅 published 可见", () => {
    expect(isContentVisible("published")).toBe(true);
    expect(isContentVisible("draft")).toBe(false);
  });
});
