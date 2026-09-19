/**
 * ReviseContent Use Case —— 已发布内容退回重审（published → review）。
 * 调用 canTransitionContent 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem } from "../domain/content";
import { canTransitionContent } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

export interface ReviseContentDeps {
  contentItems: ContentItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface ReviseContentCommand {
  contentItemId: string;
}

export interface ReviseContentResult {
  item: ContentItem;
}

export class ReviseContent {
  constructor(private readonly deps: ReviseContentDeps) {}

  async execute(cmd: ReviseContentCommand): Promise<ReviseContentResult> {
    const { contentItems, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }
      if (item.status !== "published") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能将 published 内容退回重审`
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
