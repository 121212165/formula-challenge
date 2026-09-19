/**
 * CreateContentVersion Use Case —— 为 ContentItem 创建版本快照（BR-081）。
 *
 * 输入：contentItemId, sourceId?, contentHash, createdBy?
 * 规则：
 *   1. contentItemId 必须存在
 *   2. version 号自动递增：取该内容 findLatest() 的 version，+1；无历史则从 1 开始
 *   3. 创建在 uow.transaction 内完成（版本号自增与落库需原子）
 */

import { NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type {
  ContentItemRepository,
  ContentVersionRepository,
} from "../domain/repositories";
import type { ContentVersion } from "../domain/source-version";

export interface CreateContentVersionDeps {
  contentItems: ContentItemRepository;
  contentVersions: ContentVersionRepository;
  uow: UnitOfWork;
  /** 可注入 ID 生成器（测试用） */
  idGen?: () => string;
  /** 可注入时钟（测试用） */
  now?: () => Date;
}

export interface CreateContentVersionCommand {
  contentItemId: string;
  sourceId?: string;
  contentHash: string;
  createdBy?: string;
}

export interface CreateContentVersionResult {
  version: ContentVersion;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class CreateContentVersion {
  constructor(private readonly deps: CreateContentVersionDeps) {}

  async execute(cmd: CreateContentVersionCommand): Promise<CreateContentVersionResult> {
    const { contentItems, contentVersions, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    if (!cmd.contentHash || cmd.contentHash.trim().length === 0) {
      throw new ValidationError("contentHash 不能为空");
    }

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }

      const latest = await contentVersions.findLatest(item.id);
      const nextVersion = (latest?.version ?? 0) + 1;

      const version: ContentVersion = {
        id: idGen(),
        contentItemId: item.id,
        version: nextVersion,
        sourceId: cmd.sourceId ?? null,
        contentHash: cmd.contentHash,
        createdBy: cmd.createdBy ?? null,
        createdAt: now(),
      };

      await contentVersions.save(version);
      return { version };
    });
  }
}
