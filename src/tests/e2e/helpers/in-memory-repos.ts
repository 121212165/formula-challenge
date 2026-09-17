/**
 * 测试用内存仓库 —— 实现 LearningRepositories 接口。
 * 用于黄金测试与集成测试；生产实现为 Prisma*Repository。
 */

import type { Attempt } from "@/modules/learning/domain/attempt";
import type { Evaluation } from "@/modules/learning/domain/evaluation";
import type { ReviewEvent } from "@/modules/learning/domain/review-event";
import type { LearningState } from "@/modules/learning/domain/learning-state";
import type { StudySession, SessionItem } from "@/modules/learning/domain/session";
import type { StudyDay } from "@/modules/learning/domain/study-day";
import type { LearningRepositories } from "@/modules/learning/domain/repositories";

export interface InMemoryStore {
  attempts: Map<string, Attempt>;
  attemptsByClientRequestId: Map<string, Attempt>;
  evaluations: Map<string, Evaluation>;
  reviewEvents: Map<string, ReviewEvent>;
  reviewEventsByAttemptId: Map<string, ReviewEvent>;
  learningStates: Map<string, LearningState>;
  sessions: Map<string, StudySession>;
  sessionItems: Map<string, SessionItem>;
  studyDays: Map<string, StudyDay>;
}

export function createInMemoryStore(): InMemoryStore {
  return {
    attempts: new Map(),
    attemptsByClientRequestId: new Map(),
    evaluations: new Map(),
    reviewEvents: new Map(),
    reviewEventsByAttemptId: new Map(),
    learningStates: new Map(),
    sessions: new Map(),
    sessionItems: new Map(),
    studyDays: new Map(),
  };
}

const stateKey = (userId: string, knowledgePointId: string) => `${userId}:${knowledgePointId}`;
const dayKey = (userId: string, localDate: string) => `${userId}:${localDate}`;

export function createInMemoryRepos(store: InMemoryStore = createInMemoryStore()): LearningRepositories {
  return {
    attempts: {
      async findById(id) {
        return store.attempts.get(id) ?? null;
      },
      async findByClientRequestId(userId, clientRequestId) {
        return store.attemptsByClientRequestId.get(`${userId}:${clientRequestId}`) ?? null;
      },
      async save(attempt) {
        store.attempts.set(attempt.id, attempt);
        store.attemptsByClientRequestId.set(
          `${attempt.userId}:${attempt.clientRequestId}`,
          attempt
        );
      },
      async updateStatus(id, status) {
        const a = store.attempts.get(id);
        if (a) store.attempts.set(id, { ...a, status });
      },
    },
    evaluations: {
      async findByAttemptId(attemptId) {
        for (const e of store.evaluations.values()) {
          if (e.attemptId === attemptId) return e;
        }
        return null;
      },
      async save(evaluation) {
        store.evaluations.set(evaluation.id, evaluation);
      },
    },
    reviewEvents: {
      async findByAttemptId(attemptId) {
        return store.reviewEventsByAttemptId.get(attemptId) ?? null;
      },
      async save(reviewEvent) {
        store.reviewEvents.set(reviewEvent.id, reviewEvent);
        store.reviewEventsByAttemptId.set(reviewEvent.attemptId, reviewEvent);
      },
    },
    learningStates: {
      async find(userId, knowledgePointId) {
        return store.learningStates.get(stateKey(userId, knowledgePointId)) ?? null;
      },
      async save(state) {
        store.learningStates.set(stateKey(state.userId, state.knowledgePointId), state);
      },
      async findDue(userId, now, limit) {
        return [...store.learningStates.values()]
          .filter((s) => s.userId === userId && s.dueAt <= now)
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
          .slice(0, limit);
      },
    },
    sessions: {
      async findById(id) {
        return store.sessions.get(id) ?? null;
      },
      async save(session) {
        store.sessions.set(session.id, session);
      },
    },
    sessionItems: {
      async findById(id) {
        return store.sessionItems.get(id) ?? null;
      },
      async findBySession(sessionId) {
        return [...store.sessionItems.values()].filter((i) => i.sessionId === sessionId);
      },
      async save(item) {
        store.sessionItems.set(item.id, item);
      },
    },
    studyDays: {
      async find(userId, localDate) {
        return store.studyDays.get(dayKey(userId, localDate)) ?? null;
      },
      async upsert(day) {
        store.studyDays.set(dayKey(day.userId, day.localDate), day);
      },
    },
  };
}
