/**
 * Identity 仓库接口 —— 认证与学习系统彻底分离（架构文档 §6）。
 * Domain 不依赖 Prisma；实现类在 infrastructure。
 */

import type {
  User,
  UserLearningProfile,
  UserSubjectPreference,
  Credential,
  EmailVerificationToken,
  PasswordResetToken,
  AuthSession,
} from "./user";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface UserProfileRepository {
  findByUserId(userId: string): Promise<UserLearningProfile | null>;
  save(profile: UserLearningProfile): Promise<void>;
}

export interface CredentialRepository {
  findByUserId(userId: string): Promise<Credential | null>;
  save(credential: Credential): Promise<void>;
}

/** 科目偏好（Onboarding 选科目）。属于身份/偏好域，不触碰任何学习状态。 */
export interface SubjectPreferenceRepository {
  findByUserId(userId: string): Promise<UserSubjectPreference[]>;
  save(preference: UserSubjectPreference): Promise<void>;
}

/** 登录会话仓储（Phase 5）。只按 tokenHash 查；save 透传 id（应用层生成）。 */
export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
}

export interface AuthTokenRepository {
  findVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null>;
  saveVerificationToken(token: EmailVerificationToken): Promise<void>;
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null>;
  savePasswordResetToken(token: PasswordResetToken): Promise<void>;
}

export interface IdentityRepositories {
  users: UserRepository;
  profiles: UserProfileRepository;
  credentials: CredentialRepository;
  subjectPrefs: SubjectPreferenceRepository;
  tokens: AuthTokenRepository;
  sessions: SessionRepository;
}
