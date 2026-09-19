/**
 * Phase 12 集成测试 —— ReviewContentIssue 真实事务闭环（SQLite + PrismaUnitOfWork）。
 *
 * 与单元测试（内存仓储）互补：这里用真实 PrismaClient 连 prisma/test.db，
 * 验证 Issue 状态机 + ContentItem 修订 + ContentVersion 留痕真正落在【同一物理事务】里。
 *
 * 覆盖：
 *   1. accept 全链路：pending→reviewing→accepted，ContentItem published→review→published，
 *      新版本带 sourceId/contentHash 可追溯；
 *   2. 重复 accept 幂等：真实库里仍只有一个 ContentVersion；
 *   3. 中途注入失败（版本落库处抛错）→ 整体回滚：ContentItem 仍是 published、Issue 仍 pending、无版本；
 *   4. reject 路径：置 rejected，ContentItem 保持 published，无版本。
 *
 * 注意：每个用例用【各自独立的 contentItemId】种子，避免版本计数跨用例互相污染。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { getTestPrisma, disconnectTestPrisma } from "./setup/test-db";
import { PrismaUnitOfWork } from "@/shared/infrastructure/prisma-unit-of-work";
import { createPrismaContentRepos } from "@/modules/content/infrastructure/prisma-content-repository-factory";
import { createGovernanceRepos } from "@/modules/governance/infrastructure/prisma-governance-repos";
import type { ContentVersionRepository } from "@/modules/content/domain/repositories";
import type { ContentVersion } from "@/modules/content/domain/source-version";
import { ReviewContentIssue } from "@/modules/governance/application/review-content-issue";

const prisma: PrismaClient = getTestPrisma();

// 每个文件唯一前缀，避免与其它集成测试在同一 SQLite 库撞主键
const R = Math.random().toString(36).slice(2, 8);
const userId = `u-gov-${R}`;
const subjectId = `subj-gov-${R}`;
const sourceId = `src-gov-${R}`;

/** 每用例独立种子一个已发布内容项，返回其 id。 */
async function seedPublishedItem(tag: string): Promise<string> {
  const contentItemId = `ci-gov-${tag}-${R}`;
  await prisma.contentItem.create({
    data: { id: contentItemId, subjectId, slug: `sini-gov-${tag}-${R}`, name: "四逆汤", status: "published" },
  });
  return contentItemId;
}

async function seedIssue(id: string, contentItemId: string): Promise<void> {
  await prisma.contentIssue.create({
    data: {
      id,
      reporterId: userId,
      contentItemId,
      type: "incorrect",
      description: "组成描述有误",
      status: "pending",
    },
  });
}

function makeUc(overrides: { contentVersions?: ContentVersionRepository } = {}) {
  const contentRepos = createPrismaContentRepos(prisma);
  const governanceRepos = createGovernanceRepos(prisma);
  const uow = new PrismaUnitOfWork({ prisma });
  const uc = new ReviewContentIssue({
    contentItems: contentRepos.contentItems,
    contentVersions: overrides.contentVersions ?? contentRepos.contentVersions,
    contentIssues: governanceRepos.contentIssues,
    uow,
    idGen: () => `ver-gov-${R}`,
  });
  return { uc };
}

beforeAll(async () => {
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.com`, timezone: "Asia/Shanghai" } });
  await prisma.subject.create({ data: { id: subjectId, code: subjectId, name: "方剂" } });
  await prisma.contentSource.create({ data: { id: sourceId, title: "伤寒论" } });
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("ReviewContentIssue 真实事务闭环（SQLite）", () => {
  it("accept 全链路：accepted + item 回到 published + 新版本带 sourceId/contentHash", async () => {
    const contentItemId = await seedPublishedItem("ok");
    const issueId = `iss-gov-ok-${R}`;
    await seedIssue(issueId, contentItemId);

    const { uc } = makeUc();
    const r = await uc.execute({
      issueId,
      reviewerId: userId,
      decision: "accept",
      resolution: "已订正组成",
      sourceId,
      contentHash: "hash-fixed",
    });

    expect(r.issue.status).toBe("accepted");
    expect(r.idempotent).toBe(false);
    expect(r.item?.status).toBe("published");

    // 真实库断言：新版本落库，带 sourceId/contentHash
    const ver = await prisma.contentVersion.findFirst({ where: { contentItemId } });
    expect(ver).not.toBeNull();
    expect(ver?.sourceId).toBe(sourceId);
    expect(ver?.contentHash).toBe("hash-fixed");
    expect(ver?.version).toBe(1);

    const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
    expect(item?.status).toBe("published");
  });

  it("重复 accept 幂等：真实库仍只有一个 ContentVersion", async () => {
    const contentItemId = await seedPublishedItem("idem");
    const issueId = `iss-gov-idem-${R}`;
    await seedIssue(issueId, contentItemId);

    const { uc } = makeUc();
    const first = await uc.execute({
      issueId,
      reviewerId: userId,
      decision: "accept",
      contentHash: "hash-1",
    });
    expect(first.idempotent).toBe(false);

    const second = await uc.execute({
      issueId,
      reviewerId: userId,
      decision: "accept",
      contentHash: "hash-2",
    });
    expect(second.idempotent).toBe(true);
    expect(second.version).toBeNull();

    // 真实库：该内容项仍只有一个版本
    const cnt = await prisma.contentVersion.count({ where: { contentItemId } });
    expect(cnt).toBe(1);
  });

  it("中途失败整体回滚：版本落库处抛错 → item 仍 published、issue 仍 pending、无版本", async () => {
    const contentItemId = await seedPublishedItem("rollback");
    const issueId = `iss-gov-rollback-${R}`;
    await seedIssue(issueId, contentItemId);

    const contentRepos = createPrismaContentRepos(prisma);
    const governanceRepos = createGovernanceRepos(prisma);

    // 包装 versions.save：在 Item 已被改为 review 之后注入失败，验证整事务回滚
    const realVersions = contentRepos.contentVersions;
    const brokenVersions: ContentVersionRepository = {
      findById: (id) => realVersions.findById(id),
      findByContentItem: (cid) => realVersions.findByContentItem(cid),
      findLatest: (cid) => realVersions.findLatest(cid),
      async save(_v: ContentVersion): Promise<void> {
        throw new Error("injected mid-transaction failure");
      },
    };

    const uow = new PrismaUnitOfWork({ prisma });
    const uc = new ReviewContentIssue({
      contentItems: contentRepos.contentItems,
      contentVersions: brokenVersions,
      contentIssues: governanceRepos.contentIssues,
      uow,
      idGen: () => `ver-gov-rollback-${R}`,
    });

    await expect(
      uc.execute({ issueId, reviewerId: userId, decision: "accept", contentHash: "hash" })
    ).rejects.toThrow("injected mid-transaction failure");

    // 回滚断言：内容项仍是 published（没有停在 review）
    const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
    expect(item?.status).toBe("published");
    // Issue 仍是 pending（pending→reviewing 的写入也回滚）
    const issue = await prisma.contentIssue.findUnique({ where: { id: issueId } });
    expect(issue?.status).toBe("pending");
    // 没有任何版本落库
    const cnt = await prisma.contentVersion.count({ where: { contentItemId } });
    expect(cnt).toBe(0);
  });

  it("reject 路径：置 rejected，ContentItem 保持 published，不建版本", async () => {
    const contentItemId = await seedPublishedItem("reject");
    const issueId = `iss-gov-reject-${R}`;
    await seedIssue(issueId, contentItemId);

    const { uc } = makeUc();
    const r = await uc.execute({
      issueId,
      reviewerId: userId,
      decision: "reject",
      resolution: "经核对无误",
    });

    expect(r.issue.status).toBe("rejected");
    expect(r.version).toBeNull();

    const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
    expect(item?.status).toBe("published");
    const cnt = await prisma.contentVersion.count({ where: { contentItemId } });
    expect(cnt).toBe(0);
  });
});
