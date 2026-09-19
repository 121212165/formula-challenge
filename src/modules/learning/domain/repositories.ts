/**
 * Learning 核心仓库接口（架构文档 §42）。
 * Domain 不直接碰 Prisma；实现类（Prisma*Repository / InMemory*Repository）在 infrastructure 层。
 */

import type { Attempt } from "./attempt";
import type { Evaluation } from "./evaluation";
import type { ReviewEvent } from "./review-event";
import type { LearningState } from "./learning-state";
import type { StudySession, SessionItem } from "./session";
import type { StudyDay } from "./study-day";

export interface AttemptRepository {
  findById(id: string): Promise<Attempt | null>;
  findByClientRequestId(userId: string, clientRequestId: string): Promise<Attempt | null>;
  save(attempt: Attempt): Promise<void>;
  updateStatus(id: string, status: Attempt["status"]): Promise<void>;
}

export interface EvaluationRepository {
  findByAttemptId(attemptId: string): Promise<Evaluation | null>;
  save(evaluation: Evaluation): Promise<void>;
}

export interface ReviewEventRepository {
  findByAttemptId(attemptId: string): Promise<ReviewEvent | null>;
  save(reviewEvent: ReviewEvent): Promise<void>;
  /** 进度读模型：取该用户全部历史 ReviewEvent（聚合复习次数 / again 分布，Phase 7 验收 5） */
  findAllByUser(userId: string): Promise<ReviewEvent[]>;
}

export interface LearningStateRepository {
  find(userId: string, knowledgePointId: string): Promise<LearningState | null>;
  save(state: LearningState): Promise<void>;
  findDue(userId: string, now: Date, limit: number): Promise<LearningState[]>;
  /** 进度读模型：取该用户全部 LearningState（稳定性分布 / 薄弱项 / due 列表，Phase 7 验收 5） */
  findAllByUser(userId: string): Promise<LearningState[]>;
  /** 进度读模型：该用户在某科目下"已学（有 LearningState）"的 published 知识点数（BR-040） */
  countLearnedByUserAndSubject(userId: string, subjectId: string): Promise<number>;
}

export interface StudySessionRepository {
  findById(id: string): Promise<StudySession | null>;
  save(session: StudySession): Promise<void>;
}

export interface SessionItemRepository {
  findById(id: string): Promise<SessionItem | null>;
  findBySession(sessionId: string): Promise<SessionItem[]>;
  save(item: SessionItem): Promise<void>;
}

export interface StudyDayRepository {
  find(userId: string, localDate: string): Promise<StudyDay | null>;
  upsert(day: StudyDay): Promise<void>;
}

/** 学习核心所需的全部仓库（FinalizeReview 事务内使用） */
export interface LearningRepositories {
  attempts: AttemptRepository;
  evaluations: EvaluationRepository;
  reviewEvents: ReviewEventRepository;
  learningStates: LearningStateRepository;
  sessions: StudySessionRepository;
  sessionItems: SessionItemRepository;
  studyDays: StudyDayRepository;
}
