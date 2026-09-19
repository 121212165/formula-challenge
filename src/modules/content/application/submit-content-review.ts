/**
 * SubmitContentReview Use Case —— 提交内容审核（draft → review）。
 * 调用 canTransitionContent 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem } from "../domain/content";
import { canTransitionContent } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

export interface SubmitContentReviewDeps {
  contentItems: ContentItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface SubmitContentReviewCommand {
  contentItemId: string;
}

export interface SubmitContentReviewResult {
  item: ContentItem;
}

export class SubmitContentReview {
  constructor(private readonly deps: SubmitContentReviewDeps) {}

  async execute(cmd: SubmitContentReviewCommand): Promise<SubmitContentReviewResult> {
    const { contentItems, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }
      if (item.status !== "draft") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能从 draft 提交审核`
        );
      }
      if (!canTransitionContent(item.status, "review")) {
        throw new InvalidStateTransitionError(
          `ContentItem 非法迁移：${item.status} → review`
        );
      }

      const updated: ContentItem = { ...item, status: "review", updatedAt: now() };
      await contentItems.save(updated);
      return { item: updated };
    });
  }
}
