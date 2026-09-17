/**
 * 各领域内存仓库 —— 供测试使用（question / knowledge / identity / study-plan）。
 */

import type { KnowledgePoint } from "@/modules/knowledge/domain/knowledge-point";
import type { KnowledgePointRepository } from "@/modules/knowledge/domain/knowledge-point-repository";
import type { QuestionInstance, QuestionTemplate } from "@/modules/question/domain/question";
import type { QuestionRepository } from "@/modules/question/domain/question-repository";
import type {
  User,
  UserLearningProfile,
  Credential,
  EmailVerificationToken,
  PasswordResetToken,
} from "@/modules/identity/domain/user";
import type { IdentityRepositories } from "@/modules/identity/domain/repositories";
import type { StudyPlan, StudyPlanItem } from "@/modules/study-plan/domain/study-plan";
import type { StudyPlanRepository } from "@/modules/study-plan/domain/study-plan-repository";

/* ----------------------------- Knowledge ----------------------------- */

export interface InMemoryKnowledgeStore {
  knowledgePoints: Map<string, KnowledgePoint>;
}

export function createInMemoryKnowledgeRepos(
  store: InMemoryKnowledgeStore = { knowledgePoints: new Map() }
): KnowledgePointRepository {
  return {
    async findById(id) {
      return store.knowledgePoints.get(id) ?? null;
    },
    async findPublishedById(id) {
      const kp = store.knowledgePoints.get(id);
      return kp && kp.status === "published" ? kp : null;
    },
    async findPublishedByContentItem(contentItemId) {
      return [...store.knowledgePoints.values()].filter(
        (kp) => kp.contentItemId === contentItemId && kp.status === "published"
      );
    },
    async save(kp) {
      store.knowledgePoints.set(kp.id, kp);
    },
  };
}

/* ----------------------------- Question ----------------------------- */

export interface InMemoryQuestionStore {
  templates: Map<string, QuestionTemplate>;
  instances: Map<string, QuestionInstance>;
}

export function createInMemoryQuestionRepos(
  store: InMemoryQuestionStore = { templates: new Map(), instances: new Map() }
): QuestionRepository {
  return {
    async findTemplateById(id) {
      return store.templates.get(id) ?? null;
    },
    async findTemplate(knowledgePointType, type) {
      for (const t of store.templates.values()) {
        if (t.knowledgePointType === knowledgePointType && t.type === type) return t;
      }
      return null;
    },
    async findInstanceById(id) {
      return store.instances.get(id) ?? null;
    },
    async countInstancesBySessionItem(sessionItemId) {
      let n = 0;
      for (const i of store.instances.values()) {
        if (i.sessionItemId === sessionItemId) n++;
      }
      return n;
    },
    async saveInstance(instance) {
      store.instances.set(instance.id, instance);
    },
  };
}

/* ----------------------------- Identity ----------------------------- */

export interface InMemoryIdentityStore {
  users: Map<string, User>;
  usersByEmail: Map<string, User>;
  profiles: Map<string, UserLearningProfile>;
  credentials: Map<string, Credential>;
  verificationTokens: Map<string, EmailVerificationToken>;
  passwordResetTokens: Map<string, PasswordResetToken>;
}

export function createInMemoryIdentityStore(): InMemoryIdentityStore {
  return {
    users: new Map(),
    usersByEmail: new Map(),
    profiles: new Map(),
    credentials: new Map(),
    verificationTokens: new Map(),
    passwordResetTokens: new Map(),
  };
}

export function createInMemoryIdentityRepos(
  store: InMemoryIdentityStore = createInMemoryIdentityStore()
): IdentityRepositories {
  return {
    users: {
      async findById(id) {
        return store.users.get(id) ?? null;
      },
      async findByEmail(email) {
        return store.usersByEmail.get(email) ?? null;
      },
      async save(user) {
        store.users.set(user.id, user);
        store.usersByEmail.set(user.email, user);
      },
    },
    profiles: {
      async findByUserId(userId) {
        return store.profiles.get(userId) ?? null;
      },
      async save(profile) {
        store.profiles.set(profile.userId, profile);
      },
    },
    credentials: {
      async findByUserId(userId) {
        return store.credentials.get(userId) ?? null;
      },
      async save(credential) {
        store.credentials.set(credential.userId, credential);
      },
    },
    tokens: {
      async findVerificationToken(tokenHash) {
        for (const t of store.verificationTokens.values()) {
          if (t.tokenHash === tokenHash) return t;
        }
        return null;
      },
      async saveVerificationToken(token) {
        store.verificationTokens.set(token.id, token);
      },
      async findPasswordResetToken(tokenHash) {
        for (const t of store.passwordResetTokens.values()) {
          if (t.tokenHash === tokenHash) return t;
        }
        return null;
      },
      async savePasswordResetToken(token) {
        store.passwordResetTokens.set(token.id, token);
      },
    },
  };
}

/* ----------------------------- StudyPlan ----------------------------- */

export interface InMemoryPlanStore {
  plans: Map<string, StudyPlan>;
  plansByUserDate: Map<string, StudyPlan>;
  items: Map<string, StudyPlanItem>;
}

export function createInMemoryPlanStore(): InMemoryPlanStore {
  return { plans: new Map(), plansByUserDate: new Map(), items: new Map() };
}

export function createInMemoryPlanRepos(
  store: InMemoryPlanStore = createInMemoryPlanStore()
): StudyPlanRepository {
  return {
    async findById(id) {
      return store.plans.get(id) ?? null;
    },
    async findByLocalDate(userId, localDate) {
      return store.plansByUserDate.get(`${userId}:${localDate}`) ?? null;
    },
    async findItemById(id) {
      return store.items.get(id) ?? null;
    },
    async findItemsByPlan(planId) {
      return [...store.items.values()]
        .filter((i) => i.planId === planId)
        .sort((a, b) => a.position - b.position);
    },
    async savePlan(plan) {
      store.plans.set(plan.id, plan);
      store.plansByUserDate.set(`${plan.userId}:${plan.localDate}`, plan);
    },
    async saveItem(item) {
      store.items.set(item.id, item);
    },
  };
}
