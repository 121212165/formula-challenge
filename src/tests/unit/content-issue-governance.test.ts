/**
 * Phase 12 单元测试 —— ContentIssue 状态机 + ReviewContentIssue 用例。
 *
 * 覆盖（纯内存仓储 + no-op UoW，快速断言领域规则）：
 *   - canTransitionIssue 全量 (from,to) 矩阵：pending→reviewing→accepted/rejected，不可跳变；
 *   - accept 全链路：pending→reviewing→accepted，ContentItem published→review→published，落新版本；
 *   - 重复 accept 幂等：不再产生第二个 ContentVersion，idempotent=true；
 *   - reject 路径：置 rejected，不改内容、不建版本；
 *   - accept 缺 contentHash → ValidationError；修订非 published 内容 → InvalidStateTransitionError。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  canTransitionIssue,
  type ContentIssue,
  type ContentIssueStatus,
} from "@/modules/governance/domain/content-issue";
import type { ContentIssueRepository } from "@/modules/governance/domain/repositories";
import type {
  ContentItemRepository,
  ContentVersionRepository,
} from "@/modules/content/domain/repositories";
import type { ContentItem } from "@/modules/content/domain/content";
import type { ContentVersion } from "@/modules/content/domain/source-version";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import {
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { ReviewContentIssue } from "@/modules/governance/application/review-content-issue";

const NOW = new Date("2026-09-18T08:00:00.000Z");

function makeUow(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

/** 自包含内存存储（照 content-governance.test.ts 范式） */
class InMemoryStore {
  items = new Map<string, ContentItem>();
  versions = new Map<string, ContentVersion>();
  issues = new Map<string, ContentIssue>();

  makeContentRepos(): {
    items: ContentItemRepository;
    versions: ContentVersionRepository;
  } {
    return {
      items: {
        findById: (id) => Promise.resolve(this.items.get(id) ?? null),
        save: (i) => { this.items.set(i.id, i); return Promise.resolve(); },
        findBySlug: () => Promise.resolve(null),
        findByStatus: () => Promise.resolve([]),
      },
      versions: {
        findById: (id) => Promise.resolve(this.versions.get(id) ?? null),
        findByContentItem: (cid) =>
          Promise.resolve([...this.versions.values()].filter((v) => v.contentItemId === cid)),
        findLatest: (cid) =>
          Promise.resolve(
            [...this.versions.values()]
              .filter((v) => v.contentItemId === cid)
              .sort((a, b) => b.version - a.version)[0] ?? null
          ),
        save: (v) => { this.versions.set(v.id, v); return Promise.resolve(); },
      },
    };
  }

  makeIssueRepo(): ContentIssueRepository {
    return {
      findById: (id) => Promise.resolve(this.issues.get(id) ?? null),
      findByContentItem: (cid) =>
        Promise.resolve([...this.issues.values()].filter((i) => i.contentItemId === cid)),
      findByStatus: (st) =>
        Promise.resolve([...this.issues.values()].filter((i) => i.status === st)),
      save: (issue) => { this.issues.set(issue.id, issue); return Promise.resolve(); },
    };
  }
}

describe("canTransitionIssue —— ContentIssue 状态机", () => {
  const states = ["pending", "reviewing", "accepted", "rejected"] as const;
  const legal = new Set([
    "pending->reviewing",
    "reviewing->accepted",
    "reviewing->rejected",
  ]);

  it.each(states.flatMap((from) => states.map((to) => ({ from, to }))))(
    "组合 $from → $to 与白名单一致",
    ({ from, to }) => {
      expect(canTransitionIssue(from, to)).toBe(legal.has(`${from}->${to}`));
    }
  );

  it("禁止跳变：pending 不能直接 accepted / rejected", () => {
    expect(canTransitionIssue("pending", "accepted")).toBe(false);
    expect(canTransitionIssue("pending", "rejected")).toBe(false);
  });

  it("accepted / rejected 是终态，不可再迁移", () => {
    for (const to of states) {
      expect(canTransitionIssue("accepted", to)).toBe(false);
      expect(canTransitionIssue("rejected", to)).toBe(false);
    }
  });
});

describe("ReviewContentIssue 用例（内存仓储）", () => {
  let store: InMemoryStore;
  let content: ReturnType<InMemoryStore["makeContentRepos"]>;
  let issueRepo: ContentIssueRepository;
  let seq: number;

  function buildUc() {
    seq = 0;
    return new ReviewContentIssue({
      contentItems: content.items,
      contentVersions: content.versions,
      contentIssues: issueRepo,
      uow: makeUow(),
      idGen: () => `gen-${++seq}`,
      now: () => NOW,
    });
  }

  function seedIssue(status: ContentIssueStatus = "pending"): ContentIssue {
    const item: ContentItem = {
      id: "item-1",
      subjectId: "formula",
      categoryId: null,
      slug: "sini-tang",
      name: "四逆汤",
      status: "published",
      sortOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.items.set(item.id, item);
    const issue: ContentIssue = {
      id: "issue-1",
      reporterId: "user-reporter",
      contentItemId: item.id,
      knowledgePointId: null,
      type: "incorrect",
      description: "组成有误",
      status,
      reviewerId: null,
      resolution: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.issues.set(issue.id, issue);
    return issue;
  }

  beforeEach(() => {
    store = new InMemoryStore();
    content = store.makeContentRepos();
    issueRepo = store.makeIssueRepo();
  });

  it("accept 全链路：pending→reviewing→accepted，item published→review→published，落新版本", async () => {
    seedIssue("pending");
    const uc = buildUc();

    const r = await uc.execute({
      issueId: "issue-1",
      reviewerId: "admin-1",
      decision: "accept",
      resolution: "已订正组成",
      sourceId: "src-1",
      contentHash: "hash-fixed",
    });

    expect(r.issue.status).toBe("accepted");
    expect(r.issue.reviewerId).toBe("admin-1");
    expect(r.idempotent).toBe(false);
    // 新版本带 sourceId / contentHash 可追溯
    expect(r.version).not.toBeNull();
    expect(r.version!.version).toBe(1);
    expect(r.version!.sourceId).toBe("src-1");
    expect(r.version!.contentHash).toBe("hash-fixed");
    // 内容项最终回到 published
    expect(r.item!.status).toBe("published");
    expect(store.versions.size).toBe(1);
  });

  it("重复 accept 幂等：不产生第二个 ContentVersion，idempotent=true", async () => {
    seedIssue("pending");
    const uc = buildUc();

    const first = await uc.execute({
      issueId: "issue-1",
      reviewerId: "admin-1",
      decision: "accept",
      contentHash: "hash-1",
    });
    expect(first.idempotent).toBe(false);
    expect(store.versions.size).toBe(1);

    const second = await uc.execute({
      issueId: "issue-1",
      reviewerId: "admin-2",
      decision: "accept",
      contentHash: "hash-2",
    });
    expect(second.idempotent).toBe(true);
    expect(second.version).toBeNull();
    // 仍然只有一个版本，内容项仍 published
    expect(store.versions.size).toBe(1);
    expect(store.versions.get("gen-1")!.contentHash).toBe("hash-1");
    expect(store.items.get("item-1")!.status).toBe("published");
  });

  it("reject 路径：置 rejected，不改内容、不建版本", async () => {
    seedIssue("pending");
    const uc = buildUc();

    const r = await uc.execute({
      issueId: "issue-1",
      reviewerId: "admin-1",
      decision: "reject",
      resolution: "经核对无误",
    });

    expect(r.issue.status).toBe("rejected");
    expect(r.issue.resolution).toBe("经核对无误");
    expect(r.version).toBeNull();
    expect(r.item).toBeNull();
    expect(store.items.get("item-1")!.status).toBe("published");
    expect(store.versions.size).toBe(0);

    // 已 rejected 再 reject 也幂等
    const again = await uc.execute({
      issueId: "issue-1",
      reviewerId: "admin-1",
      decision: "reject",
    });
    expect(again.idempotent).toBe(true);
    expect(store.versions.size).toBe(0);
  });

  it("accept 缺 contentHash → ValidationError", async () => {
    seedIssue("pending");
    const uc = buildUc();
    await expect(
      uc.execute({ issueId: "issue-1", reviewerId: "admin-1", decision: "accept" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("修订非 published 内容 → InvalidStateTransitionError", async () => {
    const issue = seedIssue("pending");
    // 把内容项改成 draft（未发布）
    store.items.get(issue.contentItemId)!.status = "draft";
    const uc = buildUc();
    await expect(
      uc.execute({
        issueId: "issue-1",
        reviewerId: "admin-1",
        decision: "accept",
        contentHash: "h",
      })
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("issue 不存在 → NotFoundError", async () => {
    const uc = buildUc();
    await expect(
      uc.execute({ issueId: "ghost", reviewerId: "admin-1", decision: "reject" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
