/**
 * KnowledgePoint 仓库接口 —— Domain 依赖接口，不依赖 Prisma。
 */

import type { KnowledgePoint } from "./knowledge-point";

export interface KnowledgePointRepository {
  findById(id: string): Promise<KnowledgePoint | null>;
  findPublishedById(id: string): Promise<KnowledgePoint | null>;
  findPublishedByContentItem(contentItemId: string): Promise<KnowledgePoint[]>;
  /** 进度读模型：某科目下已发布 KnowledgePoint 总数（Phase 7 验收 5 coverage 分母） */
  countPublishedBySubject(subjectId: string): Promise<number>;
  /**
   * 计划器候选（Phase 9 新增只读方法）：某科目下全部已发布 KnowledgePoint。
   * 按重要度 weight 降序、sortOrder 升序返回；study-plan 用它做"新知识自发现"，
   * 再在 use case 内排除用户已有 LearningState 的知识点（不把"已学"判断下沉到本仓库）。
   */
  listPublishedBySubject(subjectId: string): Promise<KnowledgePoint[]>;
  save(kp: KnowledgePoint): Promise<void>;
}
