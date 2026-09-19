/**
 * ReviewContentIssue Use Case —— 审核一条内容治理 Issue（Phase 12 / 架构文档 §32，BR-082）。
 *
 * 状态机：pending → reviewing → accepted | rejected（见 canTransitionIssue，禁止跳变）。
 *
 * 输入：issueId, reviewerId, decision(accept|reject), resolution?,
 *       accept 时的可选修订信息 sourceId?/contentHash/createdBy?。
 *
 * 流程（全部写在【同一个 uow.transaction】内，任一步失败整体回滚）：
 *   1. 加载 Issue；不存在 → NotFoundError。
 *   2. 幂等：已是 accepted/rejected 终态 → 直接原样返回，不重复建版本、不重复改内容。
 *   3. pending → reviewing（canTransitionIssue 守卫）；若已是 reviewing 则跳过本步。
 *   4. decision=reject → 置 rejected，落 reviewerId/resolution。
 *      decision=accept  → 置 accepted，并在同一事务内完成内容修订闭环：
 *         a. ContentItem 必须为 published，published → review（ReviseContent 语义，canTransitionContent 守卫）；
 *         b. 用 contentVersions 生成新版本快照（version 自增，必须落 sourceId/contentHash，BR-081 可追溯）；
 *         c. review → published（PublishContent 语义，canTransitionContent 守卫）。
 *
 * 为什么不直接组合 ReviseContent / CreateContentVersion / PublishContent 三个用例？
 * 这三个用例各自内部都会再开一个 uow.transaction（嵌套 Prisma 交互式事务，SQLite 单写者下
 * 会冲突）。这里在【唯一】一层事务内复用同一组仓储 + 同名状态机守卫，语义完全一致，
 * 同时保证 Issue 状态与 ContentItem/ContentVersion 真正落在同一物理事务里。
 */

import {
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import { canTransitionContent } from "@/modules/content/domain/content";
import type { ContentItem } from "@/modules/content/domain/content";
import type {
  ContentItemRepository,
  ContentVersionRepository,
} from "@/modules/content/domain/repositories";
import type { ContentVersion } from "@/modules/content/domain/source-version";
import type { ContentIssueRepository } from "../domain/repositories";
import type {
  ContentIssue,
  ContentIssueStatus,
} from "../domain/content-issue";
import { canTransitionIssue } from "../domain/content-issue";
import type { AuditLogger } from "@/server/audit/audit-log";

export type ReviewDecision = "accept" | "reject";

export interface ReviewContentIssueDeps {
  contentItems: ContentItemRepository;
  contentVersions: ContentVersionRepository;
  contentIssues: ContentIssueRepository;
  uow: UnitOfWork;
  /** 可注入 ID 生成器（测试用） */
  idGen?: () => string;
  /** 可注入时钟（测试用） */
  now?: () => Date;
  /** Phase 13 审计：审核结论在同一事务内写 ISSUE_REVIEW（缺省 no-op） */
  auditLog?: AuditLogger;
}

export interface ReviewContentIssueCommand {
  issueId: string;
  reviewerId: string;
  decision: ReviewDecision;
  /** 审核结论说明（接受/拒绝理由） */
  resolution?: string;
  // ── accept 时的修订信息（reject 时忽略）──
  /** 修订所依据的内容来源 id（可追溯，BR-080） */
  sourceId?: string;
  /** 修订后内容的内容哈希（必填，版本快照 BR-081） */
  contentHash?: string;
  /** 修订操作人；缺省回退到 reviewerId */
  createdBy?: string;
}

export interface ReviewContentIssueResult {
  issue: ContentIssue;
  /** accept 且本次确实新建了版本时返回；幂等重复审核 / reject 时为 null */
  version: ContentVersion | null;
  /** accept 后回到 published 的内容项；其它路径为 null */
  item: ContentItem | null;
  /** 命中幂等（Issue 已 accepted/rejected）时为 true */
  idempotent: boolean;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class ReviewContentIssue {
  constructor(private readonly deps: ReviewContentIssueDeps) {}

  async execute(cmd: ReviewContentIssueCommand): Promise<ReviewContentIssueResult> {
    const { contentItems, contentVersions, contentIssues, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    if (cmd.decision !== "accept" && cmd.decision !== "reject") {
      throw new ValidationError("decision 必须是 accept 或 reject");
    }

    return uow.transaction(async () => {
      const issue = await contentIssues.findById(cmd.issueId);
      if (!issue) {
        throw new NotFoundError(`ContentIssue ${cmd.issueId} 不存在`);
      }

      // ── 幂等：终态直接返回，绝不重复建版本 / 重复改内容 ──
      if (issue.status === "accepted" || issue.status === "rejected") {
        return { issue, version: null, item: null, idempotent: true };
      }

      // ── pending → reviewing（标记审核中）；reviewing 直接进入下一阶段 ──
      let current: ContentIssue = issue;
      if (current.status === "pending") {
        current = this.guard(current, "reviewing", now());
        await contentIssues.save(current);
      }
      // 到这里 current.status 必然是 "reviewing"

      // ── 拒绝路径 ──
      if (cmd.decision === "reject") {
        const rejected = this.guard(current, "rejected", now(), {
          reviewerId: cmd.reviewerId,
          resolution: cmd.resolution ?? current.resolution,
        });
        await contentIssues.save(rejected);
        // Phase 13：与审核状态同一事务写审计。
        await this.deps.auditLog?.record({
          action: "ISSUE_REVIEW",
          actorUserId: cmd.reviewerId,
          targetType: "ContentIssue",
          targetId: rejected.id,
          detail: { decision: "reject", resolution: rejected.resolution ?? null },
        });
        return { issue: rejected, version: null, item: null, idempotent: false };
      }

      // ── 接受路径：同一事务内完成 published→review→新版本→published → accepted ──
      const item = await contentItems.findById(current.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${current.contentItemId} 不存在`);
      }
      if (item.status !== "published") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能修订 published 内容`
        );
      }
      if (!canTransitionContent(item.status, "review")) {
        throw new InvalidStateTransitionError(
          `ContentItem 非法迁移：${item.status} → review`
        );
      }
      // a) published → review
      const inReview: ContentItem = { ...item, status: "review", updatedAt: now() };
      await contentItems.save(inReview);

      // b) 新版本快照（contentHash 必填，保证可追溯）
      const contentHash = cmd.contentHash?.trim() ?? "";
      if (!contentHash) {
        throw new ValidationError("接受修订必须提供 contentHash");
      }
      const latest = await contentVersions.findLatest(item.id);
      const nextVersion = (latest?.version ?? 0) + 1;
      const version: ContentVersion = {
        id: idGen(),
        contentItemId: item.id,
        version: nextVersion,
        sourceId: cmd.sourceId ?? null,
        contentHash,
        createdBy: cmd.createdBy ?? cmd.reviewerId ?? null,
        createdAt: now(),
      };
      await contentVersions.save(version);

      // c) review → published
      if (!canTransitionContent("review", "published")) {
        throw new InvalidStateTransitionError("ContentItem 非法迁移：review → published");
      }
      const published: ContentItem = { ...inReview, status: "published", updatedAt: now() };
      await contentItems.save(published);

      // d) Issue → accepted
      const accepted = this.guard(current, "accepted", now(), {
        reviewerId: cmd.reviewerId,
        resolution: cmd.resolution ?? current.resolution,
      });
      await contentIssues.save(accepted);

      // Phase 13：与内容修订/版本/状态机同一事务写审计（ISSUE_REVIEW + CONTENT_PUBLISH 重发布）。
      await this.deps.auditLog?.record({
        action: "ISSUE_REVIEW",
        actorUserId: cmd.reviewerId,
        targetType: "ContentIssue",
        targetId: accepted.id,
        detail: { decision: "accept", versionId: version.id, contentItemId: published.id },
      });
      await this.deps.auditLog?.record({
        action: "CONTENT_PUBLISH",
        actorUserId: cmd.reviewerId,
        targetType: "ContentItem",
        targetId: published.id,
        detail: { version: version.version, contentHash, via: "issue_review" },
      });

      return { issue: accepted, version, item: published, idempotent: false };
    });
  }

  /** 状态机守卫 + 拷贝出新状态的小工具：非法迁移直接抛 InvalidStateTransitionError。 */
  private guard(
    issue: ContentIssue,
    to: ContentIssueStatus,
    ts: Date,
    patch: Partial<Pick<ContentIssue, "reviewerId" | "resolution">> = {}
  ): ContentIssue {
    if (!canTransitionIssue(issue.status, to)) {
      throw new InvalidStateTransitionError(
        `ContentIssue 非法迁移：${issue.status} → ${to}`
      );
    }
    return { ...issue, status: to, ...patch, updatedAt: ts };
  }
}
