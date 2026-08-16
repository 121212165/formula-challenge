// 多科目评分引擎扩展(2026-08,需求 FR-2.5 / FR-3.5)
// 方剂的 diffIngredients(集合比对)只适用于药物组成;
// 中药「功效默写」与腧穴「定位默写」需要新评分规则:
//  - 功效:分句归一化 + 同义词典 + textSimilarity 加权均分
//  - 定位:关键特征关键词命中率
import { normalize, textSimilarity } from "@/lib/match";

// ==================== 同义词典(功效类) ====================
// 中医功效同义改写映射:标准词 → 可接受变体
// 评分时把用户回答与标准答案都按词典归一化后再比对
const SYNONYM_MAP: Record<string, string[]> = {
  清热: ["清解", "清泻"],
  燥湿: ["除湿", "祛湿", "化湿", "渗湿", "利湿"],
  泻火: ["降火", "清火", "退火"],
  解毒: ["解表毒", "清解热毒"],
  止血: ["摄血", "止溢血"],
  安胎: ["固胎", "保胎"],
  益气: ["补气", "益元气"],
  健脾: ["补脾", "助脾运"],
  和胃: ["调胃", "安胃"],
  疏肝: ["舒肝", "理肝气"],
  活血: ["行血", "化瘀"],
  化瘀: ["祛瘀", "散瘀"],
  止痛: ["定痛", "缓痛"],
  通络: ["活络", "通经络"],
  祛风: ["息风", "疏风"],
  滋阴: ["养阴", "育阴", "益阴"],
  温阳: ["助阳", "补阳"],
  固表: ["实表", "固卫"],
  敛汗: ["止汗", "收汗"],
  平喘: ["定喘", "止咳喘"],
  化痰: ["祛痰", "消痰"],
  止咳: ["止嗽"],
  润肠: ["滑肠", "润燥通便"],
  通便: ["泻下", "攻下"],
  利水: ["利尿", "渗水"],
  消肿: ["消水肿", "退肿"],
  安神: ["宁心", "定志", "镇静"],
  开窍: ["醒神", "通窍"],
  醒脾: ["醒胃"],
  消食: ["化食", "助消化"],
  行气: ["理气", "通气"],
  降逆: ["止逆", "下气"],
  止呕: ["和胃止呕"],
};

// 反向索引:变体 → 标准词
const VARIANT_TO_STD: Record<string, string> = {};
for (const [std, variants] of Object.entries(SYNONYM_MAP)) {
  VARIANT_TO_STD[std] = std;
  for (const v of variants) VARIANT_TO_STD[v] = std;
}

/** 单句归一化:去空白 + 同义替换(最长词优先,避免"清热"先命中"清") */
export function normalizeWithSynonyms(s: string): string {
  const n = normalize(s);
  if (!n) return n;
  // 按长度降序匹配同义词,贪心替换
  const stdWords = Object.keys(VARIANT_TO_STD).sort((a, b) => b.length - a.length);
  let out = n;
  for (const word of stdWords) {
    // 全局替换(仅替换独立出现,不破坏其他词)
    const re = new RegExp(word, "g");
    out = out.replace(re, VARIANT_TO_STD[word]);
  }
  return out;
}

/** 功效字符串按标点切分为功效句 */
export function splitClauses(s: string): string[] {
  return s
    .split(/[，,。;；、\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 功效默写评分(FR-2.5):
 * 用户回答与标准功效各切分为功效句 → 归一化 → 双向最大匹配逐句相似度 → 加权均分
 */
export function functionClauseScore(userAnswer: string, reference: string): number {
  if (!userAnswer.trim() && !reference.trim()) return 1;
  if (!userAnswer.trim() || !reference.trim()) return 0;

  const userClauses = splitClauses(userAnswer).map(normalizeWithSynonyms);
  const refClauses = splitClauses(reference).map(normalizeWithSynonyms);
  if (refClauses.length === 0) return userClauses.length ? 0 : 1;

  // 对每个标准功效句,找用户回答中最相似的一句(允许用户合并多句)
  let total = 0;
  for (const ref of refClauses) {
    let best = 0;
    for (const user of userClauses) {
      const sim = textSimilarity(user, ref);
      if (sim > best) best = sim;
    }
    total += best;
  }
  const recall = total / refClauses.length;

  // 惩罚用户多答的无关句子(precision):用户句中与所有标准句都不匹配的惩罚
  let precisionPenalty = 0;
  for (const user of userClauses) {
    let bestMatch = 0;
    for (const ref of refClauses) {
      const sim = textSimilarity(user, ref);
      if (sim > bestMatch) bestMatch = sim;
    }
    if (bestMatch < 0.3) precisionPenalty += 1;
  }
  const precision = userClauses.length === 0 ? 0 : 1 - precisionPenalty / userClauses.length;

  return Math.max(0, Math.min(1, recall * 0.7 + precision * 0.3));
}

// ==================== 定位关键词评分(FR-3.5) ====================

// 常见解剖/定位特征词典:命中即计分
const LOCATION_KEYWORDS = [
  "掌骨", "指间", "腕横纹", "肘横纹", "腋", "肩峰", "锁骨", "胸锁", "剑突", "脐", "耻骨",
  "髂前上棘", "髂嵴", "骶骨", "尾骨", "坐骨", "股骨", "胫骨", "腓骨", "踝", "跟腱", "跖骨",
  "足趾", "拇指", "食指", "中指", "无名指", "小指", "桡侧", "尺侧", "胫侧", "腓侧", "内侧",
  "外侧", "前正中线", "后正中线", "乳头", "乳中", "咽喉", "鼻翼", "眶下", "眉弓", "颞", "额角",
  "枕骨", "发际", "耳尖", "耳垂", "颊车", "下颌", "颏", "天突", "膻中", "气海", "关元",
  "肋骨", "肋间", "胸椎", "腰椎", "颈椎", "棘突", "横突", "椎体", "肩胛", "冈上", "冈下",
  "三角肌", "肱二头肌", "肱桡肌", "尺骨", "桡骨", "腕骨", "掌指关节", "指蹼", "足背", "足心",
  "涌泉", "膝眼", "髌骨", "腘横纹", "会阴", "耻骨联合", "肋弓", "季肋",
];

/** 定位文本 → 命中的特征关键词集合 */
export function extractLocationKeywords(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  const hits = LOCATION_KEYWORDS.filter((kw) => n.includes(normalize(kw)));
  return hits;
}

/**
 * 定位默写评分(FR-3.5):
 * 命中率 = |用户命中 ∩ 标准命中| / |标准命中|
 * 用户多答的无关特征按 precision 折扣
 */
export function locationKeywordScore(userAnswer: string, reference: string): number {
  const refHits = extractLocationKeywords(reference);
  const userHits = extractLocationKeywords(userAnswer);
  if (refHits.length === 0) {
    // 标准定位无特征词(极短定位),退回文本相似度
    return textSimilarity(userAnswer, reference);
  }
  if (userHits.length === 0) return 0;

  const hitSet = new Set(userHits);
  const correct = refHits.filter((k) => hitSet.has(k)).length;
  const recall = correct / refHits.length;
  const precision = correct / userHits.length;

  // 定位场景 recall 权重更高(漏标志=判错),precision 略宽松(多答解剖词可容忍)
  return Math.max(0, Math.min(1, recall * 0.8 + precision * 0.2));
}

/** 通用多科目评分入口:按 subject+questionType 分发 */
export function scoreByQuestionType(
  subject: "formula" | "herb" | "acupoint",
  questionType: string,
  userAnswer: string,
  reference: string
): number {
  // 方剂/中药的 ingredients 类走集合比对,由调用方处理
  if (subject === "herb" && questionType === "functions") {
    return functionClauseScore(userAnswer, reference);
  }
  if (subject === "acupoint" && questionType === "location") {
    return locationKeywordScore(userAnswer, reference);
  }
  if (subject === "acupoint" && questionType === "functions") {
    return functionClauseScore(userAnswer, reference);
  }
  return textSimilarity(userAnswer, reference);
}
