/**
 * Identity 领域 —— 回答"你是谁"，不回答"你掌握了什么"。
 * User 只承载身份；学习相关属性全部外置。
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  /** IANA 时区，如 "Asia/Shanghai" —— 所有业务日期计算都依赖它（BR-093） */
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LearningStage = "beginner" | "intermediate" | "advanced" | "exam";

export interface UserLearningProfile {
  userId: string;
  dailyMinutes: number;
  dailyItemTarget: number;
  learningStage: LearningStage;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSubjectPreference {
  userId: string;
  subjectId: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}
