/**
 * ContentItem 状态机集成测试（架构文档 §31）。
 * 合法路径：draft → review → published → archived；
 * published → review（修订重审）；review → draft（驳回）；archived → published（恢复）。
 * 禁止 draft → published 直通。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InvalidStateTransitionError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem, ContentItemStatus } from "@/modules/content/domain/content";
import { canTransitionContent } from "@/modules/content/domain/content";
import type { ContentItemRepository } from "@/modules/content/domain/repositories";
import { SubmitContentReview } from "@/modules/content/application/submit-content-review";
import { PublishContent } from "@/modules/content/application/publish-content";
import { ArchiveContent } from "@/modules/content/application/archive-content";
import { RejectContent } from "@/modules/content/application/reject-content";
import { ReviseContent } from "@/modules/content/application/revise-content";

const NOW = new Date("2026-09-18T08:00:00.000Z");

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

/** 简单内存 ContentItem 仓库（Map 存储） */
class InMemoryContentItemRepo implements ContentItemRepository {
  private readonly map = new Map<string, ContentItem>();

  async findById(id: string): Promise<ContentItem | null> {
    return this.map.get(id) ?? null;
  }

  async save(item: ContentItem): Promise<void> {
    this.map.set(item.id, item);
  }

  async findBySlug(subjectId: string, slug: string): Promise<ContentItem | null> {
    for (const item of this.map.values()) {
      if (item.subjectId === subjectId && item.slug === slug) return item;
    }
    return null;
  }

  async findByStatus(status: ContentItemStatus): Promise<ContentItem[]> {
    return [...this.map.values()].filter((i) => i.status === status);
  }
}

function makeDraftItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "ci-1",
    subjectId: "formula",
    categoryId: null,
    slug: "mahuang-tang",
    name: "麻黄汤",
    status: "draft",
    sortOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** 一键跑通 draft → review → published */
async function reachPublished(repo: InMemoryContentItemRepo, id = "ci-1"): Promise<ContentItem> {
  await repo.save(makeDraftItem({ id }));
  const submitted = await new SubmitContentReview({
    contentItems: repo,
    uow: makeUnitOfWork(),
    now: () => NOW,
  }).execute({ contentItemId: id });
  expect(submitted.item.status).toBe("review");
  const published = await new PublishContent({
    contentItems: repo,
    uow: makeUnitOfWork(),
    now: () => NOW,
  }).execute({ contentItemId: id });
  return published.item;
}

describe("ContentItem 状态机", () => {
  let repo: InMemoryContentItemRepo;

  beforeEach(() => {
    repo = new InMemoryContentItemRepo();
  });

  it("draft → review → published → archived 合法路径全部通过", async () => {
    await repo.save(makeDraftItem());

    const review = await new SubmitContentReview({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1" });
    expect(review.item.status).toBe("review");

    const published = await new PublishContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1" });
    expect(published.item.status).toBe("published");

    const archived = await new ArchiveContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1" });
    expect(archived.item.status).toBe("archived");
  });

  it("draft → published 直通被拒（抛 InvalidStateTransitionError）", async () => {
    await repo.save(makeDraftItem());
    const publish = new PublishContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    });
    const err = await publish.execute({ contentItemId: "ci-1" }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidStateTransitionError);
    expect((err as InvalidStateTransitionError).code).toBe("INVALID_STATE_TRANSITION");
    // 状态未被改变
    expect((await repo.findById("ci-1"))?.status).toBe("draft");
  });

  it("review → draft 驳回修改合法（RejectContent）", async () => {
    await repo.save(makeDraftItem());
    await new SubmitContentReview({ contentItems: repo, uow: makeUnitOfWork(), now: () => NOW })
      .execute({ contentItemId: "ci-1" });

    const rejected = await new RejectContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1", reason: "组成表述不清" });
    expect(rejected.item.status).toBe("draft");
  });

  it("published → review 退回重审合法（ReviseContent）", async () => {
    await reachPublished(repo);

    const revised = await new ReviseContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1" });
    expect(revised.item.status).toBe("review");
    // 再次发布仍合法
    const republished = await new PublishContent({
      contentItems: repo,
      uow: makeUnitOfWork(),
      now: () => NOW,
    }).execute({ contentItemId: "ci-1" });
    expect(republished.item.status).toBe("published");
  });

  it("archived → published 恢复合法（状态机守卫允许）", () => {
    // archived → published 是合法恢复路径；当前应用层未提供独立恢复用例，
    // 此处断言状态机契约允许该迁移。
    expect(canTransitionContent("archived", "published")).toBe(true);
    // 对照：非法路径一律 false
    const illegal: Array<[ContentItemStatus, ContentItemStatus]> = [
      ["draft", "published"],
      ["draft", "archived"],
      ["review", "archived"],
      ["archived", "review"],
    ];
    for (const [from, to] of illegal) {
      expect(canTransitionContent(from, to)).toBe(false);
    }
  });
});
