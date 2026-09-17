/**
 * 知识点类型统一编码。
 * 禁止再使用 subject + questionType 两层字符串猜含义。
 * 例如 "麻黄汤·组成" 的 type 是 "formula.ingredients"。
 */

export type SubjectCode = "formula" | "herb" | "acupoint";

export type FormulaKnowledgePointType =
  | "formula.ingredients"
  | "formula.functions"
  | "formula.indications"
  | "formula.mnemonic";

export type HerbKnowledgePointType =
  | "herb.property"
  | "herb.meridian"
  | "herb.functions"
  | "herb.indications"
  | "herb.usage"
  | "herb.contraindications";

export type AcupointKnowledgePointType =
  | "acupoint.location"
  | "acupoint.indications"
  | "acupoint.method"
  | "acupoint.special"
  | "acupoint.mnemonic";

export type KnowledgePointType =
  | FormulaKnowledgePointType
  | HerbKnowledgePointType
  | AcupointKnowledgePointType;

/** 每个知识点类型对应的科目（用于路由/权限/评估器分发） */
export function subjectOfKnowledgePointType(type: KnowledgePointType): SubjectCode {
  if (type.startsWith("formula.")) return "formula";
  if (type.startsWith("herb.")) return "herb";
  return "acupoint";
}
