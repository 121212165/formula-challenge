/**
 * KnowledgePoint 仓库接口 —— Domain 依赖接口，不依赖 Prisma。
 */

import type { KnowledgePoint } from "./knowledge-point";

export interface KnowledgePointRepository {
  findById(id: string): Promise<KnowledgePoint | null>;
  findPublishedById(id: string): Promise<KnowledgePoint | null>;
  findPublishedByContentItem(contentItemId: string): Promise<KnowledgePoint[]>;
  save(kp: KnowledgePoint): Promise<void>;
}
