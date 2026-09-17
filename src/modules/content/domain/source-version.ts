/**
 * 内容来源与版本 —— 已发布内容必须可追溯（BR-080 / BR-081）。
 */

export interface ContentSource {
  id: string;
  title: string;
  edition: string | null;
  publisher: string | null;
  year: number | null;
  citation: string | null;
  createdAt: Date;
}

export interface ContentVersion {
  id: string;
  contentItemId: string;
  version: number;
  sourceId: string | null;
  contentHash: string;
  createdBy: string | null;
  createdAt: Date;
}
