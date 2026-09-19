/**
 * Content 仓库接口（架构文档 §31）。
 * Domain 不直接碰 Prisma；实现类（Prisma*Repository / InMemory*Repository）在 infrastructure 层。
 */

import type { ContentItem, ContentItemStatus } from "./content";
import type { ContentSource, ContentVersion } from "./source-version";

export interface ContentItemRepository {
  findById(id: string): Promise<ContentItem | null>;
  save(item: ContentItem): Promise<void>;
  /** 按学科 + slug 定位内容（路由用） */
  findBySlug(subjectId: string, slug: string): Promise<ContentItem | null>;
  /** 按状态筛选（运营/审核列表用） */
  findByStatus(status: ContentItemStatus): Promise<ContentItem[]>;
}

/** 内容来源（BR-080）：已发布内容必须可追溯到出处。 */
export interface ContentSourceRepository {
  findById(id: string): Promise<ContentSource | null>;
  findAll(): Promise<ContentSource[]>;
  save(source: ContentSource): Promise<void>;
}

/** 内容版本快照（BR-081）：每次修订留痕。 */
export interface ContentVersionRepository {
  findById(id: string): Promise<ContentVersion | null>;
  findByContentItem(contentItemId: string): Promise<ContentVersion[]>;
  /** 某内容当前最新版本（version 最大者），用于版本号自增 */
  findLatest(contentItemId: string): Promise<ContentVersion | null>;
  save(version: ContentVersion): Promise<void>;
}

/** Content 域所需的全部仓库 */
export interface ContentRepositories {
  contentItems: ContentItemRepository;
  contentSources: ContentSourceRepository;
  contentVersions: ContentVersionRepository;
}
