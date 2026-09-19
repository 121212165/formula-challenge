/**
 * ArchiveContent Use Case —— 归档内容（published → archived）。
 * 调用 canTransitionContent 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem } from "../domain/content";
import { canTransitionContent } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

export interface ArchiveContentDeps {
  contentItems: ContentItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface ArchiveContentCommand {
  contentItemId: string;
}

export interface ArchiveContentResult {
  item: ContentItem;
}

export class ArchiveContent {
  constructor(private readonly deps: ArchiveContentDeps) {}

  async execute(cmd: ArchiveContentCommand): Promise<ArchiveContentResult> {
    const { contentItems, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }
      if (item.status !== "published") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能归档 published 内容`
        );
      }
      if (!canTransitionContent(item.status, "archived")) {
        throw new InvalidStateTransitionError(
          `ContentItem 非法迁移：${item.status} → archived`
        );
      }

      const updated: ContentItem = { ...item, status: "archived", updatedAt: now() };
      await contentItems.save(updated);
      return { item: updated };
    });
  }
}
