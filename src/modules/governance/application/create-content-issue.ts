/**
 * CreateContentIssue Use Case —— 用户报告内容问题（BR-082 / 架构文档 §32）。
 *
 * 输入：reporterId, contentItemId, knowledgePointId?, type, description
 * 规则：
 *   1. contentItemId 必须存在（通过 ContentItemRepository 校验）
 *   2. 创建的 Issue 初始状态为 pending，永不直接改动 canonical 内容
 *   3. 创建在 uow.transaction 内完成
 */

import { NotFoundError, ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { ContentItemRepository } from "@/modules/content/domain/repositories";
import type { ContentIssueRepository } from "../domain/repositories";
import type {
  ContentIssue,
  ContentIssueType,
} from "../domain/content-issue";

export interface CreateContentIssueDeps {
  contentItems: ContentItemRepository;
  contentIssues: ContentIssueRepository;
  uow: UnitOfWork;
  /** 可注入 ID 生成器（测试用） */
  idGen?: () => string;
  /** 可注入时钟（测试用） */
  now?: () => Date;
}

export interface CreateContentIssueCommand {
  reporterId: string;
  contentItemId: string;
  knowledgePointId?: string;
  type: ContentIssueType;
  description: string;
}

export interface CreateContentIssueResult {
  issue: ContentIssue;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class CreateContentIssue {
  constructor(private readonly deps: CreateContentIssueDeps) {}

  async execute(cmd: CreateContentIssueCommand): Promise<CreateContentIssueResult> {
    const { contentItems, contentIssues, uow } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    if (!cmd.description || cmd.description.trim().length === 0) {
      throw new ValidationError("问题描述不能为空");
    }

    return uow.transaction(async () => {
      const item = await contentItems.findById(cmd.contentItemId);
      if (!item) {
        throw new NotFoundError(`ContentItem ${cmd.contentItemId} 不存在`);
      }

      const ts = now();
      const issue: ContentIssue = {
        id: idGen(),
        reporterId: cmd.reporterId,
        contentItemId: item.id,
        knowledgePointId: cmd.knowledgePointId ?? null,
        type: cmd.type,
        description: cmd.description.trim(),
        status: "pending",
        reviewerId: null,
        resolution: null,
        createdAt: ts,
        updatedAt: ts,
      };

      await contentIssues.save(issue);
      return { issue };
    });
  }
}
