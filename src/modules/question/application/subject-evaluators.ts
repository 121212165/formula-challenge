/**
 * 三科目 Evaluator（question-model.md §2.3 / §3，BR-021 / BR-022）。
 *
 * FormulaEvaluator / HerbEvaluator / AcupointEvaluator 各自成类，
 * 共享同一套纯比对引擎（归一化 / 命中比例 / 逐空精确 / 选项精确），
 * 差异仅在科目级同义词表（如方剂科目知"甘草=炙甘草/生甘草"）。
 * 统一返回 EvaluationResult{score,isCorrect,confidence,feedback}。
 *
 * BR-022 不变量：本模块零 LearningState / 零 Repository / 零写操作引用，
 * 只依据 knowledgePoint + templateConfig + userAnswer 产出评价。
 *
 * 题型路由由注册表思路（registry.ts）在评分侧同样适用：
 * 未登记题型（ordering）显式抛 ValidationError，绝不静默退化为 free_recall（§3.4）。
 */

import { ValidationError } from "@/shared/errors";
import type { Evaluator, EvaluationContext } from "@/modules/learning/application/evaluator";
import type { EvaluationResult } from "@/modules/learning/domain/evaluation";
import {
  parseRequiredRatio,
  parseSeparator,
  resolveFillBlankSlots,
  type SynonymMap,
} from "../domain/template-config";
import {
  scoreFillBlank,
  scoreFreeRecall,
  scoreRecognition,
} from "../domain/scoring";

export abstract class SubjectEvaluator implements Evaluator {
  /** 科目级同义词表：canonical 项 → 可接受别名（子类覆盖） */
  protected abstract readonly synonyms: SynonymMap;

  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const { knowledgePoint, questionType, userAnswer } = ctx;

    switch (questionType) {
      case "free_recall":
        return scoreFreeRecall({
          canonicalAnswer: knowledgePoint.canonicalAnswer,
          separator: parseSeparator(ctx.templateConfig),
          requiredRatio: parseRequiredRatio(ctx.templateConfig),
          userAnswer,
        });

      case "fill_blank": {
        const blanks = resolveFillBlankSlots(
          knowledgePoint,
          ctx.templateConfig,
          ctx.instanceSequence ?? 0,
          this.synonyms
        );
        if (blanks.length === 0) {
          throw new ValidationError("填空题无可接受答案");
        }
        return scoreFillBlank({ blanks, userAnswer });
      }

      case "recognition":
        // 评分只认正确项（= canonicalAnswer），与渲染期干扰项无关
        return scoreRecognition({
          correctAnswer: knowledgePoint.canonicalAnswer,
          userAnswer,
        });

      default:
        // ordering / 非法题型：显式报错，不静默退化为 free_recall（§3.4）
        throw new ValidationError(
          `题型 ${questionType as string} 尚未落地评分器（不静默退化为 free_recall）`
        );
    }
  }
}

/** 方剂科目：药名别名 */
export class FormulaEvaluator extends SubjectEvaluator {
  protected override readonly synonyms: SynonymMap = {
    甘草: ["炙甘草", "生甘草", "粉甘草"],
    麻黄: ["炙麻黄", "麻黄绒"],
    桂枝: ["嫩桂枝"],
  };
}

/** 中药科目：性味归经别名 */
export class HerbEvaluator extends SubjectEvaluator {
  protected override readonly synonyms: SynonymMap = {
    甘: ["甘味", "味甘"],
    温: ["性温", "气温"],
    辛: ["辛味", "味辛"],
  };
}

/** 腧穴科目：定位别名 */
export class AcupointEvaluator extends SubjectEvaluator {
  protected override readonly synonyms: SynonymMap = {
    肘横纹: ["肘横纹中", "肘横纹处"],
    腕横纹: ["腕横纹中", "腕横纹处"],
    脐中: ["神阙", "肚脐中央"],
  };
}
