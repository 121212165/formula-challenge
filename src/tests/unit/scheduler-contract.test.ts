/**
 * Scheduler 单元测试契约 —— learning-model.md §21 之 S-1 ~ S-4。
 *
 * 本文件只补测试，不改任何实现。被测对象：
 *   - 接口：src/modules/learning/domain/scheduler.ts
 *   - 实现：src/modules/learning/infrastructure/fsrs-scheduler.ts（FsrsScheduler）
 *
 * 与既有 fsrs-mapping.test.ts 的分工：
 *   - 既有文件覆盖 initialize / again / good / easy / 连续评级 / fsrsState 保真；
 *   - 本文件补齐：显式 "hard" 评级用例（S-3）、"Review 永不产生非法状态" 的
 *     性质化断言（S-4）、initialize 确定性（S-1）、again 推进规则（S-2），
 *     以及领域层不依赖 ts-fsrs 的架构隔离证据。
 *
 * ── 架构隔离证据（Grep 实测，写于本节以留痕）─────────────────────────────
 * 1) 在 src/modules/learning/domain/ 下按子串搜索 `ts-fsrs`：
 *    命中 1 处 —— learning-state.ts 第 40 行 JSDoc 注释（"ts-fsrs State 枚举：
 *    New=0 / Learning=1 / Review=2 / Relearning=3"），仅为文字说明，不是 import。
 * 2) 在同一目录按真实依赖模式搜索（`from "ts-fsrs"` / `require("ts-fsrs")` /
 *    `import ... from "ts-fsrs"`）：命中 0 处。
 * 3) 因此"领域层不直接依赖库类型"成立——唯一子串命中是注释。下面
 *    「架构隔离证据」describe 中的 it 在测试运行时再用 node:fs 读源码复核一次。
 * ────────────────────────────────────────────────────────────────────────
 *
 * 固定时钟：NOW = 2026-09-18T10:00:00Z（与既有 mapping 测试一致，保证可复现）。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReviewRating } from "@/shared/types/rating";
import type { LearningStateDraft } from "@/modules/learning/domain/learning-state";
import { FsrsScheduler } from "@/modules/learning/infrastructure/fsrs-scheduler";

const scheduler = new FsrsScheduler();
const NOW = new Date("2026-09-18T10:00:00.000Z");
const RATINGS: readonly ReviewRating[] = ["again", "hard", "good", "easy"];

/** FSRS 状态机合法取值：New=0 / Learning=1 / Review=2 / Relearning=3。 */
const LEGAL_FSRS_STATES = new Set([0, 1, 2, 3]);

const fresh = (): LearningStateDraft => scheduler.initialize(NOW);

describe("S-1 新条目产生确定性合法初始态", () => {
  it("对同一 now 调用两次 initialize，结果逐字段深相等（确定性，无隐藏随机/时间漂移）", () => {
    const first = scheduler.initialize(NOW);
    const second = scheduler.initialize(NOW);
    expect(first).toEqual(second);
  });

  it("初始数值字段归零/归一：stability=0、difficulty=0、retrievability=1", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.stability).toBe(0);
    expect(draft.difficulty).toBe(0);
    expect(draft.retrievability).toBe(1);
  });

  it("初始计数字段归零：reviewCount=0、lapseCount=0", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.reviewCount).toBe(0);
    expect(draft.lapseCount).toBe(0);
  });

  it("初始未学习字段为空：lastReviewedAt=null、lastRating=null", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.lastReviewedAt).toBeNull();
    expect(draft.lastRating).toBeNull();
  });

  it("dueAt 与传入 now 为同一引用，且 fsrsState === 0（State.New）", () => {
    const draft = scheduler.initialize(NOW);
    expect(draft.dueAt).toBe(NOW);
    expect(draft.fsrsState).toBe(0);
  });
});

describe("S-2 Again 按规则推进 dueAt", () => {
  it("新卡评 again 后：dueAt > now、reviewCount=1、lastRating='again'", () => {
    const after = scheduler.review(fresh(), "again", NOW);
    expect(after.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(after.reviewCount).toBe(1);
    expect(after.lastRating).toBe("again");
  });
});

describe("S-3 Hard / Good / Easy 各自产生合法 next state", () => {
  it.each(["hard", "good", "easy"] as const)(
    "新卡评 '%s'：reviewCount=1、lastRating 正确、dueAt 为未来有限值、fsrsState ∈ {0,1,2,3}",
    (rating) => {
      const after = scheduler.review(fresh(), rating, NOW);
      expect(after.reviewCount).toBe(1);
      expect(after.lastRating).toBe(rating);
      expect(after.dueAt).toBeInstanceOf(Date);
      expect(Number.isFinite(after.dueAt.getTime())).toBe(true);
      expect(after.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(LEGAL_FSRS_STATES.has(after.fsrsState)).toBe(true);
    }
  );

  it("排序不变量：good 的 dueAt 严格大于 again 的 dueAt", () => {
    const againDue = scheduler.review(fresh(), "again", NOW).dueAt.getTime();
    const goodDue = scheduler.review(fresh(), "good", NOW).dueAt.getTime();
    expect(goodDue).toBeGreaterThan(againDue);
  });

  it("排序不变量：easy 的 stability 不小于 good 的 stability（越易记 → 稳定度越高）", () => {
    const goodStab = scheduler.review(fresh(), "good", NOW).stability;
    const easyStab = scheduler.review(fresh(), "easy", NOW).stability;
    expect(easyStab).toBeGreaterThanOrEqual(goodStab);
  });

  it("排序不变量：hard 的 stability 不大于 good 的 stability（越难记 → 稳定度越低）", () => {
    const goodStab = scheduler.review(fresh(), "good", NOW).stability;
    const hardStab = scheduler.review(fresh(), "hard", NOW).stability;
    expect(hardStab).toBeLessThanOrEqual(goodStab);
  });
});

describe("S-4 Review 永不产生非法状态（性质化断言）", () => {
  /** 固定种子的可复现 PRNG（mulberry32），保证"随机"序列每次跑结果一致。 */
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSequences(): ReviewRating[][] {
    // 枚举序列：单调同评级（again/hard/good/easy 各一条）+ 一条交错混合序列。
    const enumerated: ReviewRating[][] = [
      ["again", "again", "again", "again", "again"],
      ["hard", "hard", "hard", "hard", "hard", "hard"],
      ["good", "good", "good", "good", "good", "good", "good"],
      ["easy", "easy", "easy", "easy", "easy", "easy", "easy", "easy"],
      ["good", "good", "again", "hard", "good", "easy", "again", "good", "hard"],
    ];

    // 伪随机序列：长度 5~10，评级在 again/hard/good/easy 上均匀取，覆盖混合场景。
    const rnd = mulberry32(20260918);
    const random: ReviewRating[][] = [];
    for (let i = 0; i < 12; i++) {
      const len = 5 + Math.floor(rnd() * 6); // 5..10
      const seq: ReviewRating[] = [];
      for (let j = 0; j < len; j++) {
        seq.push(RATINGS[Math.floor(rnd() * RATINGS.length)]!);
      }
      random.push(seq);
    }
    return [...enumerated, ...random];
  }

  it("固定 now 下，枚举+伪随机评级序列（长度 5~10）串联 review，每步输出恒满足合法性不变量", () => {
    for (const seq of buildSequences()) {
      let draft = scheduler.initialize(NOW);
      expect(draft.reviewCount).toBe(0);

      seq.forEach((rating, step) => {
        draft = scheduler.review(draft, rating, NOW);

        // (a) reviewCount 等于串联次数（等价于单调不减且步数精确）
        expect(draft.reviewCount).toBe(step + 1);
        // (b) fsrsState ∈ {0,1,2,3}
        expect(LEGAL_FSRS_STATES.has(draft.fsrsState)).toBe(true);
        // (c) dueAt 是有效 Date 且时间有限
        expect(draft.dueAt).toBeInstanceOf(Date);
        expect(Number.isFinite(draft.dueAt.getTime())).toBe(true);
        // (d) lastRating 等于刚评的 rating
        expect(draft.lastRating).toBe(rating);
        // (e) stability / difficulty 均为有限数
        expect(Number.isFinite(draft.stability)).toBe(true);
        expect(Number.isFinite(draft.difficulty)).toBe(true);
      });
    }
  });
});

describe("架构隔离证据：领域层不直接依赖 ts-fsrs", () => {
  it("domain 目录下所有 .ts 源码零条 import/require ts-fsrs（运行时读源码复核）", () => {
    const domainDir = fileURLToPath(
      new URL("../../modules/learning/domain/", import.meta.url)
    );
    const files = readdirSync(domainDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    // 命中真实依赖的模式：`... from "ts-fsrs"` 或 `require("ts-fsrs")`。
    const depPattern = /(from\s*["']ts-fsrs["'])|(require\(\s*["']ts-fsrs["']\s*\))/;

    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(new URL(`../../modules/learning/domain/${file}`, import.meta.url), "utf8");
      for (const line of src.split(/\r?\n/)) {
        if (depPattern.test(line)) hits.push(`${file}: ${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
