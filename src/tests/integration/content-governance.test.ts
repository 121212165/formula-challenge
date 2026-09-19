/**
 * 内容治理用例集成测试（P1-5 / BR-080 / BR-081 / BR-082）。
 * 使用内存仓库实现，验证：
 *   - CreateContentIssue 创建 pending 问题报告，且 contentItem 不存在时报错
 *   - ImportContentSource 创建内容来源，title 为空时报错
 *   - CreateContentVersion 版本号自增
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  type ContentItemRepository,
  type ContentSourceRepository,
  type ContentVersionRepository,
} from "@/modules/content/domain/repositories";
import type { ContentIssueRepository } from "@/modules/governance/domain/repositories";
import type { ContentItem } from "@/modules/content/domain/content";
import type { ContentSource, ContentVersion } from "@/modules/content/domain/source-version";
import type { ContentIssue } from "@/modules/governance/domain/content-issue";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { NotFoundError, ValidationError } from "@/shared/errors";

import { CreateContentIssue } from "@/modules/governance/application/create-content-issue";
import { ImportContentSource } from "@/modules/content/application/import-content-source";
import { CreateContentVersion } from "@/modules/content/application/create-content-version";

const NOW = new Date("2026-09-18T08:00:00.000Z");

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

/** 最小内存存储（本测试自包含）；下方用适配对象分别满足三个仓库接口 */
class InMemoryContentStore {
  items = new Map<string, ContentItem>();
  sources = new Map<string, ContentSource>();
  versions = new Map<string, ContentVersion>();

  itemById(id: string): ContentItem | null {
    return this.items.get(id) ?? null;
  }
  saveItem(item: ContentItem): void {
    this.items.set(item.id, item);
  }
  findSlug(subjectId: string, slug: string): ContentItem | null {
    for (const it of this.items.values()) {
      if (it.subjectId === subjectId && it.slug === slug) return it;
    }
    return null;
  }
  byStatus(status: ContentItem["status"]): ContentItem[] {
    return [...this.items.values()].filter((i) => i.status === status);
  }

  sourceById(id: string): ContentSource | null {
    return this.sources.get(id) ?? null;
  }
  allSources(): ContentSource[] {
    return [...this.sources.values()];
  }
  saveSource(source: ContentSource): void {
    this.sources.set(source.id, source);
  }

  versionById(id: string): ContentVersion | null {
    return this.versions.get(id) ?? null;
  }
  versionsOf(contentItemId: string): ContentVersion[] {
    return [...this.versions.values()].filter((v) => v.contentItemId === contentItemId);
  }
  latestVersion(contentItemId: string): ContentVersion | null {
    return this.versionsOf(contentItemId).sort((a, b) => b.version - a.version)[0] ?? null;
  }
  saveVersion(version: ContentVersion): void {
    this.versions.set(version.id, version);
  }
}

/** 由存储构造三个独立的仓库接口实现 */
function makeContentRepos(store: InMemoryContentStore): {
  items: ContentItemRepository;
  sources: ContentSourceRepository;
  versions: ContentVersionRepository;
} {
  return {
    items: {
      findById: (id) => Promise.resolve(store.itemById(id)),
      save: (i) => { store.saveItem(i); return Promise.resolve(); },
      findBySlug: (s, slug) => Promise.resolve(store.findSlug(s, slug)),
      findByStatus: (st) => Promise.resolve(store.byStatus(st)),
    },
    sources: {
      findById: (id) => Promise.resolve(store.sourceById(id)),
      findAll: () => Promise.resolve(store.allSources()),
      save: (s) => { store.saveSource(s); return Promise.resolve(); },
    },
    versions: {
      findById: (id) => Promise.resolve(store.versionById(id)),
      findByContentItem: (cid) => Promise.resolve(store.versionsOf(cid)),
      findLatest: (cid) => Promise.resolve(store.latestVersion(cid)),
      save: (v) => { store.saveVersion(v); return Promise.resolve(); },
    },
  };
}

class InMemoryContentIssueRepo implements ContentIssueRepository {
  issues = new Map<string, ContentIssue>();
  async findById(id: string): Promise<ContentIssue | null> {
    return this.issues.get(id) ?? null;
  }
  async findByContentItem(contentItemId: string): Promise<ContentIssue[]> {
    return [...this.issues.values()].filter((i) => i.contentItemId === contentItemId);
  }
  async findByStatus(status: ContentIssue["status"]): Promise<ContentIssue[]> {
    return [...this.issues.values()].filter((i) => i.status === status);
  }
  async save(issue: ContentIssue): Promise<void> {
    this.issues.set(issue.id, issue);
  }
}

describe("内容治理用例（BR-080/081/082）", () => {
  let store: InMemoryContentStore;
  let repos: ReturnType<typeof makeContentRepos>;
  let issueRepo: InMemoryContentIssueRepo;

  beforeEach(() => {
    store = new InMemoryContentStore();
    repos = makeContentRepos(store);
    issueRepo = new InMemoryContentIssueRepo();
    const sampleItem: ContentItem = {
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
    store.saveItem(sampleItem);
  });

  it("CreateContentIssue：为已存在内容创建 status=pending 的问题报告（BR-082）", async () => {
    const uc = new CreateContentIssue({
      contentItems: repos.items,
      contentIssues: issueRepo,
      uow: makeUnitOfWork(),
      idGen: () => "issue-1",
      now: () => NOW,
    });

    const { issue } = await uc.execute({
      reporterId: "user-1",
      contentItemId: "item-1",
      knowledgePointId: "kp-9",
      type: "incorrect",
      description: "组成描述有误",
    });

    expect(issue.id).toBe("issue-1");
    expect(issue.status).toBe("pending");
    expect(issue.contentItemId).toBe("item-1");
    expect(issue.knowledgePointId).toBe("kp-9");
    expect(issueRepo.issues.size).toBe(1);
  });

  it("CreateContentIssue：contentItemId 不存在时抛 NotFoundError", async () => {
    const uc = new CreateContentIssue({
      contentItems: repos.items,
      contentIssues: issueRepo,
      uow: makeUnitOfWork(),
      idGen: () => "issue-x",
      now: () => NOW,
    });
    await expect(
      uc.execute({ reporterId: "user-1", contentItemId: "ghost", type: "other", description: "x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ImportContentSource：创建内容来源记录（BR-080）", async () => {
    const uc = new ImportContentSource({
      contentSources: repos.sources,
      idGen: () => "src-1",
      now: () => NOW,
    });

    const { source } = await uc.execute({
      title: "伤寒论",
      edition: "宋本",
      publisher: "人民卫生出版社",
      year: 2010,
      citation: "宋本《伤寒论》辨少阴病脉证并治",
    });

    expect(source.id).toBe("src-1");
    expect(source.title).toBe("伤寒论");
    expect(source.edition).toBe("宋本");
    expect(store.sources.size).toBe(1);
  });

  it("ImportContentSource：title 为空抛 ValidationError", async () => {
    const uc = new ImportContentSource({
      contentSources: repos.sources,
      idGen: () => "src-x",
      now: () => NOW,
    });
    await expect(uc.execute({ title: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("CreateContentVersion：首次版本为 1，再次创建自增为 2（BR-081）", async () => {
    const first = new CreateContentVersion({
      contentItems: repos.items,
      contentVersions: repos.versions,
      uow: makeUnitOfWork(),
      idGen: () => "ver-1",
      now: () => NOW,
    });
    const r1 = await first.execute({
      contentItemId: "item-1",
      sourceId: "src-1",
      contentHash: "hash-aaa",
      createdBy: "editor-1",
    });
    expect(r1.version.version).toBe(1);
    expect(r1.version.contentItemId).toBe("item-1");

    const second = new CreateContentVersion({
      contentItems: repos.items,
      contentVersions: repos.versions,
      uow: makeUnitOfWork(),
      idGen: () => "ver-2",
      now: () => NOW,
    });
    const r2 = await second.execute({
      contentItemId: "item-1",
      contentHash: "hash-bbb",
    });
    expect(r2.version.version).toBe(2);
  });

  it("CreateContentVersion：contentItem 不存在抛 NotFoundError", async () => {
    const uc = new CreateContentVersion({
      contentItems: repos.items,
      contentVersions: repos.versions,
      uow: makeUnitOfWork(),
      idGen: () => "ver-x",
      now: () => NOW,
    });
    await expect(
      uc.execute({ contentItemId: "ghost", contentHash: "h" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
