/**
 * Phase 6 Question Engine 端到端测试（question-model.md §2/§3）。
 *
 * 链路：模板实例化（GenerateQuestion + 注册表渲染）→ QuestionInstance 落库
 * （knowledgePointId + templateId + sequence）→ 构造 submitted Attempt
 * → EvaluateAttempt（三科目 Evaluator）→ 断言 EvaluationResult 各字段。
 *
 * 覆盖：三题型各正确/错误两路径；free_recall 归一化容差与多候选命中比例；
 * fill_blank 同义词；recognition 干扰项不含正确答案；ordering 显式报错；
 * Evaluator 零 LearningState 修改（BR-022）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GenerateQuestion } from "@/modules/question/application/generate-question";
import { buildDefaultQuestionRegistry } from "@/modules/question/domain/registry";
import {
  AcupointEvaluator,
  FormulaEvaluator,
} from "@/modules/question/application/subject-evaluators";
import { EvaluateAttempt } from "@/modules/learning/application/evaluate-attempt";
import {
  createInMemoryRepos,
  createInMemoryStore,
  type InMemoryStore,
} from "@/tests/e2e/helpers/in-memory-repos";
import {
  createInMemoryKnowledgeRepos,
  createInMemoryQuestionRepos,
  type InMemoryKnowledgeStore,
  type InMemoryQuestionStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import { createNoopUnitOfWork } from "@/tests/e2e/helpers/noop-unit-of-work";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { QuestionTemplate } from "@/modules/question/domain/question";
import type { Attempt } from "@/modules/learning/domain/attempt";
import type { Evaluator } from "@/modules/learning/application/evaluator";
import type { SynonymMap } from "@/modules/question/domain/template-config";

/** 与 FormulaEvaluator 同源的同义词表，保证生成挖空 accept 与评分一致 */
const FORMULA_SYNONYMS: SynonymMap = {
  甘草: ["炙甘草", "生甘草", "粉甘草"],
  麻黄: ["炙麻黄", "麻黄绒"],
  桂枝: ["嫩桂枝"],
};

const UID = "u-1";
const NOW = () => new Date("2026-09-18T08:00:00.000Z");

function kp(partial: Partial<KnowledgePoint> & Pick<KnowledgePoint, "id" | "type" | "title" | "canonicalAnswer">): KnowledgePoint {
  return {
    contentItemId: "ci-1",
    code: partial.id,
    explanation: null,
    difficulty: 1,
    weight: 1,
    status: "published",
    sortOrder: 1,
    ...partial,
  };
}

function tpl(partial: Partial<QuestionTemplate> & Pick<QuestionTemplate, "knowledgePointType" | "type">): QuestionTemplate {
  const id = `tpl-${partial.knowledgePointType}-${partial.type}`;
  return { id, difficulty: 1, config: {}, enabled: true, ...partial };
}

/** 按模板对象自身 id 入键，保证 findTemplateById 能命中 */
function addTpl(ctx: Ctx, t: QuestionTemplate): QuestionTemplate {
  ctx.qStore.templates.set(t.id, t);
  return t;
}

interface Ctx {
  store: InMemoryStore;
  kpStore: InMemoryKnowledgeStore;
  qStore: InMemoryQuestionStore;
  kps: ReturnType<typeof createInMemoryKnowledgeRepos>;
  questions: ReturnType<typeof createInMemoryQuestionRepos>;
}

function makeCtx(): Ctx {
  const store = createInMemoryStore();
  const kpStore: InMemoryKnowledgeStore = { knowledgePoints: new Map() };
  const qStore: InMemoryQuestionStore = { templates: new Map(), instances: new Map() };
  return {
    store,
    kpStore,
    qStore,
    kps: createInMemoryKnowledgeRepos(kpStore),
    questions: createInMemoryQuestionRepos(qStore),
  };
}

function seedSessionItem(ctx: Ctx, knowledgePointId: string) {
  ctx.store.sessions.set("s-1", {
    id: "s-1", userId: UID, subjectId: "formula", mode: "daily",
    startedAt: NOW(), endedAt: null, status: "active", durationSeconds: 0,
  });
  ctx.store.sessionItems.set("item-1", {
    id: "item-1", sessionId: "s-1", knowledgePointId,
    position: 0, status: "pending", questionInstanceId: null,
  });
}

/** findSiblings：同知识点类型、排除自身、已发布（recognition 干扰项来源） */
function siblingProvider(ctx: Ctx) {
  return async (_kpId: string, type: string) =>
    [...ctx.kpStore.knowledgePoints.values()].filter(
      (k) => k.type === type && k.id !== _kpId && k.status === "published"
    );
}

function makeGenerator(ctx: Ctx, useFormulaSynonyms = true) {
  return new GenerateQuestion({
    questions: ctx.questions,
    knowledgePoints: ctx.kps,
    sessionItems: createInMemoryRepos(ctx.store).sessionItems,
    uow: createNoopUnitOfWork(),
    idGen: () => "qi-1",
    now: NOW,
    registry: buildDefaultQuestionRegistry(),
    findSiblings: siblingProvider(ctx),
    synonyms: useFormulaSynonyms ? FORMULA_SYNONYMS : {},
  });
}

async function seedSubmittedAttempt(
  ctx: Ctx,
  attemptId: string,
  questionInstanceId: string,
  knowledgePointId: string,
  userAnswer: string
) {
  const attempt: Attempt = {
    id: attemptId, userId: UID, sessionId: "s-1", sessionItemId: "item-1",
    questionInstanceId, knowledgePointId, userAnswer,
    startedAt: NOW(), submittedAt: NOW(), timeSpentSeconds: 10,
    status: "submitted", clientRequestId: `cr-${attemptId}`,
  };
  ctx.store.attempts.set(attemptId, attempt);
  ctx.store.attemptsByClientRequestId.set(`${UID}:cr-${attemptId}`, attempt);
}

function makeEvaluator(ctx: Ctx, evaluator: Evaluator) {
  return new EvaluateAttempt({
    repos: createInMemoryRepos(ctx.store),
    knowledgePoints: ctx.kps,
    questions: ctx.questions,
    evaluator,
    uow: createNoopUnitOfWork(),
    idGen: () => "ev-1",
    now: NOW,
  });
}

describe("Phase 6 Question Engine 端到端", () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = makeCtx();
  });

  /* --------------------------- free_recall --------------------------- */
  it("free_recall：归一化容差（标点/空白/全角/小写）下判对，落库实例指针完整", async () => {
    const fr = kp({ id: "kp-fr", type: "formula.ingredients", title: "麻黄汤·组成", canonicalAnswer: "麻黄、桂枝、杏仁、甘草" });
    ctx.kpStore.knowledgePoints.set(fr.id, fr);
    addTpl(ctx, tpl({ knowledgePointType: "formula.ingredients", type: "free_recall" }));
    seedSessionItem(ctx, fr.id);

    const gen = makeGenerator(ctx);
    const { instance, question } = await gen.execute({
      sessionItemId: "item-1", knowledgePointId: fr.id,
    });

    // 渲染：题干固定"复述 {title}"
    expect(question).not.toBeNull();
    expect(question!.kind).toBe("free_recall");
    expect(question!.stem).toBe("复述：麻黄汤·组成");

    // 落库指针：knowledgePointId + templateId + sequence
    expect(instance.knowledgePointId).toBe(fr.id);
    expect(instance.templateId).toBe("tpl-formula.ingredients-free_recall");
    expect(instance.sequence).toBe(0);
    expect(ctx.qStore.instances.size).toBe(1);
    expect(ctx.store.sessionItems.get("item-1")?.questionInstanceId).toBe("qi-1");

    // 作答：全角括号、小写、额外空白与中文标点变体
    await seedSubmittedAttempt(ctx, "att-1", instance.id, fr.id, "  （Ma Huang） 麻黄，桂枝，杏仁，甘草。  ");
    const evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    const ev = await evaluate.execute({ attemptId: "att-1" });
    expect(ev.isCorrect).toBe(true);
    expect(ev.score).toBe(1);
  });

  it("free_recall：错误作答 → isCorrect=false 且附带参考答案反馈", async () => {
    const fr = kp({ id: "kp-fr", type: "formula.ingredients", title: "麻黄汤·组成", canonicalAnswer: "麻黄、桂枝、杏仁、甘草" });
    ctx.kpStore.knowledgePoints.set(fr.id, fr);
    addTpl(ctx, tpl({ knowledgePointType: "formula.ingredients", type: "free_recall" }));
    seedSessionItem(ctx, fr.id);

    const { instance } = await makeGenerator(ctx).execute({
      sessionItemId: "item-1", knowledgePointId: fr.id,
    });
    await seedSubmittedAttempt(ctx, "att-2", instance.id, fr.id, "桂枝汤");
    const evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    const ev = await evaluate.execute({ attemptId: "att-2" });
    expect(ev.isCorrect).toBe(false);
    expect(ev.score).toBe(0);
    expect(ev.feedback).toContain("参考答案");
    // BR-022：评价不写 LearningState
    expect(ctx.store.learningStates.size).toBe(0);
  });

  it("free_recall：多候选（/ 分隔）+ requiredRatio 命中比例，同义答案判对", async () => {
    const multi = kp({ id: "kp-multi", type: "herb.property", title: "人参", canonicalAnswer: "人参/圆参" });
    ctx.kpStore.knowledgePoints.set(multi.id, multi);
    addTpl(ctx, tpl({ knowledgePointType: "herb.property", type: "free_recall", config: { requiredRatio: 0.5 } }));
    seedSessionItem(ctx, multi.id);

    const { instance } = await makeGenerator(ctx).execute({
      sessionItemId: "item-1", knowledgePointId: multi.id, type: "free_recall",
    });
    // 同义候选"圆参"也应判对（命中比例 1/2 >= 0.5）
    await seedSubmittedAttempt(ctx, "att-3", instance.id, multi.id, "圆参");
    let evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    let ev = await evaluate.execute({ attemptId: "att-3" });
    expect(ev.isCorrect).toBe(true);

    // 无关答案 → 0 命中 → 错
    await seedSubmittedAttempt(ctx, "att-3b", instance.id, multi.id, "丹参");
    evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    ev = await evaluate.execute({ attemptId: "att-3b" });
    expect(ev.isCorrect).toBe(false);
  });

  /* --------------------------- fill_blank --------------------------- */
  it("fill_blank：挖空一味药，canonical 与同义词均可判对，错误作答判错", async () => {
    const fb = kp({ id: "kp-fb", type: "formula.ingredients", title: "麻黄汤·组成", canonicalAnswer: "麻黄、桂枝、杏仁、甘草" });
    ctx.kpStore.knowledgePoints.set(fb.id, fb);
    addTpl(ctx, tpl({ knowledgePointType: "formula.ingredients", type: "fill_blank" }));
    seedSessionItem(ctx, fb.id);

    const { instance, question } = await makeGenerator(ctx).execute({
      sessionItemId: "item-1", knowledgePointId: fb.id, type: "fill_blank",
    });
    expect(question!.kind).toBe("fill_blank");
    if (question!.kind !== "fill_blank") throw new Error("expected fill_blank");
    expect(question!.stem).toBe("____、桂枝、杏仁、甘草");
    // 同义词进入 accept（canonical 麻黄 + 炙麻黄/麻黄绒）
    expect(question!.blanks[0]!.accept).toContain("麻黄");
    expect(question!.blanks[0]!.accept).toContain("炙麻黄");

    // canonical 正确
    await seedSubmittedAttempt(ctx, "att-fb1", instance.id, fb.id, "麻黄");
    let evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    let ev = await evaluate.execute({ attemptId: "att-fb1" });
    expect(ev.isCorrect).toBe(true);
    expect(ev.score).toBe(1);

    // 同义词判对
    await seedSubmittedAttempt(ctx, "att-fb2", instance.id, fb.id, "炙麻黄");
    evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    ev = await evaluate.execute({ attemptId: "att-fb2" });
    expect(ev.isCorrect).toBe(true);

    // 错误作答判错，反馈给正确答案
    await seedSubmittedAttempt(ctx, "att-fb3", instance.id, fb.id, "桂枝");
    evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    ev = await evaluate.execute({ attemptId: "att-fb3" });
    expect(ev.isCorrect).toBe(false);
    expect(ev.score).toBe(0);
    expect(ev.feedback).toContain("麻黄");
  });

  /* --------------------------- recognition --------------------------- */
  it("recognition：正确项+同类型干扰项，干扰项不含正确答案；选对/选错两路径", async () => {
    const rec = kp({ id: "kp-rec", type: "formula.ingredients", title: "方剂组成", canonicalAnswer: "麻黄汤" });
    const sib1 = kp({ id: "kp-sib1", type: "formula.ingredients", title: "桂枝汤", canonicalAnswer: "桂枝汤" });
    const sib2 = kp({ id: "kp-sib2", type: "formula.ingredients", title: "银翘散", canonicalAnswer: "银翘散" });
    ctx.kpStore.knowledgePoints.set(rec.id, rec);
    ctx.kpStore.knowledgePoints.set(sib1.id, sib1);
    ctx.kpStore.knowledgePoints.set(sib2.id, sib2);
    addTpl(ctx, tpl({ knowledgePointType: "formula.ingredients", type: "recognition" }));
    seedSessionItem(ctx, rec.id);

    const { instance, question } = await makeGenerator(ctx).execute({
      sessionItemId: "item-1", knowledgePointId: rec.id, type: "recognition",
    });
    expect(question!.kind).toBe("recognition");
    if (question!.kind !== "recognition") throw new Error("expected recognition");
    // 干扰项来自同类型其他已发布 KP
    expect(question!.options).toContain("麻黄汤");
    expect(question!.options).toContain("桂枝汤");
    expect(question!.options).toContain("银翘散");
    // 正确项定位正确，且干扰项归一化后不与正确项重复
    expect(question!.options[question!.correctIndex]).toBe("麻黄汤");
    const normalized = question!.options.map((o) => o.replace(/\s/g, ""));
    expect(new Set(normalized).size).toBe(normalized.length);

    // 选正确项
    await seedSubmittedAttempt(ctx, "att-rc1", instance.id, rec.id, "麻黄汤");
    let evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    let ev = await evaluate.execute({ attemptId: "att-rc1" });
    expect(ev.isCorrect).toBe(true);
    expect(ev.score).toBe(1);

    // 选干扰项 → 错
    await seedSubmittedAttempt(ctx, "att-rc2", instance.id, rec.id, "桂枝汤");
    evaluate = makeEvaluator(ctx, new FormulaEvaluator());
    ev = await evaluate.execute({ attemptId: "att-rc2" });
    expect(ev.isCorrect).toBe(false);
    expect(ev.feedback).toContain("正确答案：麻黄汤");
  });

  /* --------------------------- ordering 显式报错 --------------------------- */
  it("ordering：有模板但无出题器，显式报错且不落实例（不静默退化 free_recall）", async () => {
    const fr = kp({ id: "kp-fr", type: "formula.ingredients", title: "麻黄汤·组成", canonicalAnswer: "麻黄、桂枝、杏仁、甘草" });
    ctx.kpStore.knowledgePoints.set(fr.id, fr);
    addTpl(ctx, tpl({ knowledgePointType: "formula.ingredients", type: "ordering" }));
    seedSessionItem(ctx, fr.id);

    const gen = makeGenerator(ctx);
    await expect(
      gen.execute({ sessionItemId: "item-1", knowledgePointId: fr.id, type: "ordering" })
    ).rejects.toThrow(/ordering|出题器/);
    // 门控先于写库：不得落孤儿实例
    expect(ctx.qStore.instances.size).toBe(0);
  });

  it("缺模板：未配置题型模板时显式报错", async () => {
    const fr = kp({ id: "kp-fr", type: "formula.ingredients", title: "麻黄汤·组成", canonicalAnswer: "x" });
    ctx.kpStore.knowledgePoints.set(fr.id, fr);
    // 不插任何模板
    seedSessionItem(ctx, fr.id);
    const gen = makeGenerator(ctx);
    await expect(
      gen.execute({ sessionItemId: "item-1", knowledgePointId: fr.id })
    ).rejects.toThrow(/模板/);
  });

  /* --------------------------- 三科目 Evaluator 统一契约 --------------------------- */
  it("三科目 Evaluator 统一返回 EvaluationResult 四字段且零 LearningState 写入", async () => {
    const acup = kp({ id: "kp-ac", type: "acupoint.location", title: "足三里", canonicalAnswer: "足三里（ST36）" });
    ctx.kpStore.knowledgePoints.set(acup.id, acup);
    addTpl(ctx, tpl({ knowledgePointType: "acupoint.location", type: "free_recall" }));
    seedSessionItem(ctx, acup.id);

    const { instance } = await makeGenerator(ctx, false).execute({
      sessionItemId: "item-1", knowledgePointId: acup.id,
    });
    // AcupointEvaluator：全角括号+小写答案仍判对
    await seedSubmittedAttempt(ctx, "att-ac", instance.id, acup.id, "足三里(st36)");
    const evaluate = makeEvaluator(ctx, new AcupointEvaluator());
    const ev = await evaluate.execute({ attemptId: "att-ac" });
    expect(ev.isCorrect).toBe(true);
    // 统一四字段
    expect(typeof ev.score).toBe("number");
    expect(typeof ev.isCorrect).toBe("boolean");
    expect(ctx.store.evaluations.size).toBe(1);
    const saved = [...ctx.store.evaluations.values()][0]!;
    expect(saved).toHaveProperty("confidence");
    expect(saved).toHaveProperty("feedback");
    // BR-022：全程不写 LearningState
    expect(ctx.store.learningStates.size).toBe(0);
  });
});
