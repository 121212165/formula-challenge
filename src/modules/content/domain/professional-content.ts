/**
 * 专业内容扩展 —— 每种科目自己的结构化属性。
 * 共享的通用属性（身份/分类/排序/生命周期）在 ContentItem。
 */

export interface FormulaContent {
  contentItemId: string;
  source: string;
  alias: string[];
  level: string;
  mnemonic: string | null;
  mnemonicExplanation: string | null;
}

export interface HerbContent {
  contentItemId: string;
  source: string;
  alias: string[];
  property: string;
  meridian: string;
  usage: string;
  contraindications: string;
}

export interface Meridian {
  id: string;
  name: string;
  code: string;
  description: string;
  sortOrder: number;
}

export interface AcupointContent {
  contentItemId: string;
  pinyin: string;
  code: string;
  meridianId: string;
  location: string;
  method: string;
  caution: string;
  special: string;
}
