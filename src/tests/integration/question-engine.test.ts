/**
 * Question Engine 测试（架构文档 §13-14 / Phase 6）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GenerateQuestion } from "@/modules/question/application/generate-question";
import {
  createInMemoryKnowledgeRepos,
  createInMemoryQuestionRepos,
  type InMemoryKnowledgeStore,
  type InMemoryQuestionStore,
} from "@/tests/e2e/helpers/in-memory-domain-repos";
import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";

const KP: KnowledgePoint = {
  id: "kp-1",
  contentItemId: "ci-1",
  code: "mahuangtang.ingredients",
  type: "formula.ingredients",
  title: "麻黄汤·组成",
  canonicalAnswer: "麻黄、桂枝、杏仁、甘草",
  explanation: null,
  difficulty: 1,
  weight: 1,
  status: "published",
  sortOrder: 1,
};

function makeUnitOfWork(): UnitOfWork {
  return { async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } };
}

describe("GenerateQuestion", () => {
  let kpStore: InMemoryKnowledgeStore;
  let qStore: InMemoryQuestionStore;

  beforeEach(() => {
    kpStore = { knowledgePoints: new Map([[KP.id, KP]]) };
    qStore = {
      templates: new Map([
        ["tpl-fr", {
          id: "tpl-fr",
          knowledgePointType: "formula.ingredients",
          type: "free_recall",
          difficulty: 1,
          config: {},
          enabled: true,
        }],
      ]),
      instances: new Map(),
    };
  });

  it("为 SessionItem 生成 free_recall 实例（sequence 递增）", async () => {
    const uc = new GenerateQuestion({
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
      idGen: () => "qi-1",
      now: () => new Date("2026-09-17T08:01:00.000Z"),
    });
    const { instance } = await uc.execute({
      sessionItemId: "item-1",
      knowledgePointId: KP.id,
    });
    expect(instance.templateId).toBe("tpl-fr");
    expect(instance.knowledgePointId).toBe(KP.id);
    expect(instance.sequence).toBe(0);
    expect(qStore.instances.size).toBe(1);

    // 第二个实例 sequence 递增
    const second = await uc.execute({
      sessionItemId: "item-1",
      knowledgePointId: KP.id,
      type: "free_recall",
    });
    expect(second.instance.sequence).toBe(1);
  });

  it("未发布的知识点不能出题", async () => {
    kpStore.knowledgePoints.set("kp-draft", { ...KP, id: "kp-draft", status: "draft" });
    const uc = new GenerateQuestion({
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
    });
    await expect(
      uc.execute({ sessionItemId: "item-1", knowledgePointId: "kp-draft" })
    ).rejects.toThrow(/未发布/);
  });

  it("知识点类型没有对应模板时报错", async () => {
    qStore.templates.clear();
    const uc = new GenerateQuestion({
      questions: createInMemoryQuestionRepos(qStore),
      knowledgePoints: createInMemoryKnowledgeRepos(kpStore),
      uow: makeUnitOfWork(),
    });
    await expect(
      uc.execute({ sessionItemId: "item-1", knowledgePointId: KP.id })
    ).rejects.toThrow(/模板/);
  });
});
