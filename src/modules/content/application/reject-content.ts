/**
 * RejectContent Use Case —— 驳回内容（review → draft），退回修改。
 * 调用 canTransitionContent 守卫；非法迁移抛 InvalidStateTransitionError。
 */

import { InvalidStateTransitionError, NotFoundError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItem } from "../domain/content";
import { canTransitionContent } from "../domain/content";
import type { ContentItemRepository } from "../domain/repositories";

export interface RejectContentDeps {
  contentItems: ContentItemRepository;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface RejectContentCommand {
  contentItemId: string;
  /** 驳回原因（可选），由上层记录/展示；ContentItem 模型本身不含该字段 */
  reason?: string;
}

export interface RejectContentResult {
  item: ContentItem;
}

export class RejectContent {
  constructor(private readonly deps: RejectContentDeps) {}

  async execute(cmd: RejectContentCommand): Promise<RejectContentResult> {
    const { contentItems, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }
      if (item.status !== "review") {
        throw new InvalidStateTransitionError(
          `ContentItem 当前状态 ${item.status}，只能驳回 review 内容`
        );
      }
      if (!canTransitionContent(item.status, "draft")) {
        throw new InvalidStateTransitionError(
          `ContentItem 非法迁移：${item.status} → draft`
        );
      }

      const updated: ContentItem = { ...item, status: "draft", updatedAt: now() };
      await contentItems.save(updated);
      return { item: updated };
    });
  }
}
