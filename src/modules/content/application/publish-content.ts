/**
 * PublishContent Use Case —— 发布内容（review → published）。
 * 调用 canTransitionContent 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem } from "../domain/content";
import { canTransitionContent } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

export interface PublishContentDeps {
  contentItems: ContentItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface PublishContentCommand {
  contentItemId: string;
}

export interface PublishContentResult {
  item: ContentItem;
}

export class PublishContent {
  constructor(private readonly deps: PublishContentDeps) {}

  async execute(cmd: PublishContentCommand): Promise<PublishContentResult> {
    const { contentItems, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }
      if (item.status !== "review") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能从 review 发布`
        );
      }
      if (!canTransitionContent(item.status, "published")) {
        throw new InvalidStateTransitionError(
          `ContentItem 非法迁移：${item.status} → published`
        );
      }

      const updated: ContentItem = { ...item, status: "published", updatedAt: now() };
      await contentItems.save(updated);
      return { item: updated };
    });
  }
}
