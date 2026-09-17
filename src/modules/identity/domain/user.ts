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
  /** 邮箱验证时间；null = 未验证（身份属性，非学习属性） */
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Credential {
  userId: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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
