/**
 * FsrsScheduler 映射单元测试（架构文档 §19 / learning-model §10）。
 *
 * 验证 Scheduler 接口的实现契约：initialize 产出干净 draft，review 推进状态。
 * 断言依据实际 fsrs-scheduler.ts 接口（initialize/review）与 ts-fsrs 真实输出。
 *
 * 注：经实测，新卡片（Learning 态）首次评 "again" 时 lapseCount 仍为 0——
 * FSRS 的 lapse 仅在"已进入 Review 态后被遗忘"时才累计，初次学习失败不计 lapse。
 * 这里按源码真实不变量断言，而非按直觉假设。
 */
import { describe, it, expect } from "vitest";
import { State } from "ts-fsrs";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";
import type { LearningStateDraft } from "@/modules/learning/domain/learning-state";

const scheduler = new FsrsScheduler();
const NOW = new Date("2026-09-18T10:00:00Z");

describe("FsrsScheduler.initialize —— 初始学习状态 draft", () => {
  it("产出全新 draft：stability=0, difficulty=0, retrievability=1", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.stability).toBe(0);
    expect(draft.difficulty).toBe(0);
    expect(draft.retrievability).toBe(1);
  });

  it("计数字段归零：reviewCount=0, lapseCount=0", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.reviewCount).toBe(0);
    expect(draft.lapseCount).toBe(0);
  });

  it("时间/评级字段处于未学习状态：dueAt=now, lastReviewedAt=null, lastRating=null", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.dueAt.getTime()).toBe(NOW.getTime());
    expect(draft.lastReviewedAt).toBeNull();
    expect(draft.lastRating).toBeNull();
  });

  it("返回值满足 LearningStateDraft 形状（9 个字段齐全，无多余/缺失）", () => {
    const draft = scheduler.initialize(NOW);
    expect(Object.keys(draft).sort()).toEqual(
      [
        "stability",
        "difficulty",
        "retrievability",
        "dueAt",
        "lastReviewedAt",
        "reviewCount",
        "lapseCount",
        "lastRating",
        "fsrsState",
      ].sort()
    );
  });

  it("initialize() 的 fsrsState 为 State.New（0）—— 新卡片从未进入学习", () => {
    expect(scheduler.initialize(NOW).fsrsState).toBe(0);
  });
});

describe("FsrsScheduler.review —— 单次评级推进", () => {
  const fresh = (): LearningStateDraft => scheduler.initialize(NOW);

  it("评 'again'：reviewCount=1, lastRating='again', dueAt 在未来", () => {
    const after = scheduler.review(fresh(), "again", NOW);
    expect(after.reviewCount).toBe(1);
    expect(after.lastRating).toBe("again");
    expect(after.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(after.lastReviewedAt?.getTime()).toBe(NOW.getTime());
  });

  it("评 'again'（新卡片）：lapseCount 仍为 0（初次学习失败不累计 lapse，记录此行为）", () => {
    const after = scheduler.review(fresh(), "again", NOW);
    expect(after.lapseCount).toBe(0);
  });

  it("评 'good'：reviewCount=1, lapseCount=0, lastRating='good', stability>0", () => {
    const after = scheduler.review(fresh(), "good", NOW);
    expect(after.reviewCount).toBe(1);
    expect(after.lapseCount).toBe(0);
    expect(after.lastRating).toBe("good");
    expect(after.stability).toBeGreaterThan(0);
  });

  it("'good' 的下次复习时间比 'again' 更远（记得更牢 → 间隔更长）", () => {
    const againDue = scheduler.review(fresh(), "again", NOW).dueAt.getTime();
    const goodDue = scheduler.review(fresh(), "good", NOW).dueAt.getTime();
    expect(goodDue).toBeGreaterThan(againDue);
  });

  it("评 'easy'：stability 大于 'good' 的 stability（更易记 → 稳定度更高）", () => {
    const goodStab = scheduler.review(fresh(), "good", NOW).stability;
    const easyStab = scheduler.review(fresh(), "easy", NOW).stability;
    expect(easyStab).toBeGreaterThan(goodStab);
  });
});

describe("FsrsScheduler.review —— 连续评级与状态持续性", () => {
  it("连续两次 'good'：reviewCount 累计到 2，状态持续推进", () => {
    const first = scheduler.review(scheduler.initialize(NOW), "good", NOW);
    const second = scheduler.review(first, "good", NOW);
    expect(second.reviewCount).toBe(2);
    expect(second.lastRating).toBe("good");
    expect(second.lapseCount).toBe(0);
  });

  it("连续 'good' 后 dueAt 比单次 'good' 更靠后（记忆被巩固，间隔拉长）", () => {
    const once = scheduler.review(scheduler.initialize(NOW), "good", NOW);
    const twice = scheduler.review(once, "good", NOW);
    expect(twice.dueAt.getTime()).toBeGreaterThan(once.dueAt.getTime());
  });

  it("每次 review 都刷新 lastReviewedAt 并保留 lastRating 为最近一次评级", () => {
    const g1 = scheduler.review(scheduler.initialize(NOW), "good", NOW);
    expect(g1.lastReviewedAt?.getTime()).toBe(NOW.getTime());
    expect(g1.lastRating).toBe("good");

    const a1 = scheduler.review(g1, "again", NOW);
    expect(a1.lastRating).toBe("again");
    expect(a1.reviewCount).toBe(2);
  });
});

describe("FsrsScheduler —— FSRS 卡片状态机保真（P2-3）", () => {
  // ts-fsrs State 枚举：New=0 / Learning=1 / Review=2 / Relearning=3。
  // draftToCard 不再硬编码 State.Review，而是从 draft.fsrsState 还原，
  // 否则首次 again 后卡片会被错误提升到 Review 态。
  // 经实测本版本 ts-fsrs 的毕业路径：New →(again/good)→ Learning →(good)→ Review →(again)→ Relearning。
  const fresh = (): LearningStateDraft => scheduler.initialize(NOW);

  it("首次对新卡片评 'again' → 进入 Learning 态（State.Learning=1），不是 Review", () => {
    const after = scheduler.review(fresh(), "again", NOW);
    expect(after.fsrsState).toBe(State.Learning);
    expect(after.fsrsState).toBe(1);
  });

  it("首次对新卡片评 'good' → 仍在 Learning 态（State.Learning=1），新卡需先经历学习", () => {
    const after = scheduler.review(fresh(), "good", NOW);
    // 注：与"新卡 good 直接毕业到 Review"的直觉不同，本版本 FSRS 把新卡首次 good
    // 也放入 Learning；状态由 nextCard.state 真实透传，而非硬编码 Review。
    expect(after.fsrsState).toBe(State.Learning);
    expect(after.fsrsState).toBe(1);
  });

  it("连续 review：fsrsState 沿 nextCard.state 正确传递，不被硬编码回 Review", () => {
    // 新卡 good → Learning(1)
    const afterGood = scheduler.review(fresh(), "good", NOW);
    expect(afterGood.fsrsState).toBe(State.Learning);

    // 在 Learning 态上再评 good → 毕业到 Review(2)，状态来自 draft.fsrsState 还原
    const graduated = scheduler.review(afterGood, "good", NOW);
    expect(graduated.fsrsState).toBe(State.Review);
    expect(graduated.fsrsState).toBe(2);

    // 在 Review 态上再评 good → 仍为 Review(2)
    const stillReview = scheduler.review(graduated, "good", NOW);
    expect(stillReview.fsrsState).toBe(State.Review);
  });

  it("Review 态卡片评 'again'（遗忘）→ 进入 Relearning 态（State.Relearning=3）", () => {
    const learned = scheduler.review(scheduler.review(fresh(), "good", NOW), "good", NOW);
    expect(learned.fsrsState).toBe(State.Review);
    const afterLapse = scheduler.review(learned, "again", NOW);
    expect(afterLapse.fsrsState).toBe(State.Relearning);
    expect(afterLapse.fsrsState).toBe(3);
  });
});
