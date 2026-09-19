/**
 * ImportContentSource Use Case —— 导入内容来源（BR-080）。
 *
 * 输入：title, edition?, publisher?, year?, citation?
 * 规则：
 *   1. title 非空（否则 ValidationError）
 *   2. 创建一条 ContentSource 记录（已发布内容必须可追溯出处）
 */

import { ValidationError } from "@/shared/errors";
import type { ContentSourceRepository } from "../domain/repositories";
import type { ContentSource } from "../domain/source-version";

export interface ImportContentSourceDeps {
  contentSources: ContentSourceRepository;
  /** 可注入 ID 生成器（测试用） */
  idGen?: () => string;
  /** 可注入时钟（测试用） */
  now?: () => Date;
}

export interface ImportContentSourceCommand {
  title: string;
  edition?: string;
  publisher?: string;
  year?: number;
  citation?: string;
}

export interface ImportContentSourceResult {
  source: ContentSource;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class ImportContentSource {
  constructor(private readonly deps: ImportContentSourceDeps) {}

  async execute(cmd: ImportContentSourceCommand): Promise<ImportContentSourceResult> {
    const { contentSources } = this.deps;
    const idGen = this.deps.idGen ?? randomId;
    const now = this.deps.now ?? (() => new Date());

    const title = cmd.title?.trim() ?? "";
    if (title.length === 0) {
      throw new ValidationError("来源标题不能为空");
    }

    const source: ContentSource = {
      id: idGen(),
      title,
      edition: cmd.edition ?? null,
      publisher: cmd.publisher ?? null,
      year: cmd.year ?? null,
      citation: cmd.citation ?? null,
      createdAt: now(),
    };

    await contentSources.save(source);
    return { source };
  }
}
