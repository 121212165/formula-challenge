// AI 诊疗边界三重防线(2026-08,需求 FR-4.5,服务端强制不可配置化)
// 防线1:system prompt 显式禁止诊疗行为
// 防线2:输出关键词过滤(命中即拦截)
// 防线3:所有回答强制追加免责尾注

// ==================== 防线 1:system prompt 模板 ====================

export const AI_SAFETY_SYSTEM_PROMPT = `你是一个中医知识学习助手,服务于中医考研学生的知识点背诵与理解。

【绝对禁止的行为】
1. 禁止任何形式的诊疗建议:不得根据用户症状推荐用药/穴位/治疗方案,不得给出"你可以服用/应该针灸/建议就医"等表述。
2. 禁止处方行为:不得给出剂量医嘱、用药方案、针刺处方。
3. 禁止替代医生:用户若提出症状或健康问题,一律引导到"请咨询执业医师"。
4. 只做知识点解释:解释某味药的性味归经、配伍禁忌(教材层面)、某穴位的定位/主治/刺灸法(教材层面)、某方剂的组成/方义。
5. 回答中不出现"你/您的病/你的症状"等针对个人的健康判断。

【回答格式】
- 用简洁的教材式语言回答知识点问题。
- 回答末尾固定追加免责声明(必须完整包含):"以上为教材知识整理,仅供学习参考,不构成医疗建议。如有健康问题请咨询执业医师。"`;

// ==================== 防线 2:输出关键词过滤 ====================
// 命中任一关键词 → 判定为越界,回答作废并降级
const BLOCKED_PATTERNS = [
  "建议就医", "及时就医", "尽快就医", "立即就医", "去医院", "看医生", "请咨询医生",
  "可服用", "可以服用", "建议服用", "服用", "用量为", "每次服用", "每日服用", "口服", "冲服", "煎服", "代茶饮",
  "按医嘱", "遵医嘱", "剂量", "处方", "开方", "抓药",
  "建议针灸", "可以针灸", "针刺治疗", "穴位治疗", "艾灸治疗", "建议艾灸",
  "治疗你的", "你的病", "你的症状", "您的症状", "针对你的情况",
];

/** 越界检测:返回命中关键词列表(空 = 安全) */
export function detectViolation(text: string): string[] {
  const hits = BLOCKED_PATTERNS.filter((p) => text.includes(p));
  return hits;
}

// ==================== 防线 3:免责尾注 ====================
export const DISCLAIMER_FOOTNOTE =
  "以上为教材知识整理,仅供学习参考,不构成医疗建议。如有健康问题请咨询执业医师。";

/** 追加免责尾注(幂等:已含则不重复) */
export function appendDisclaimer(text: string): string {
  if (text.includes("不构成医疗建议")) return text;
  return `${text.trim()}\n\n${DISCLAIMER_FOOTNOTE}`;
}

/** 最终安全出口:三道防线全过返回安全文本;任何一道失败返回 null(调用方降级) */
export function sanitizeAiReply(reply: string): string | null {
  const violation = detectViolation(reply);
  if (violation.length > 0) return null;
  return appendDisclaimer(reply);
}
