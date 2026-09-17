/**
 * Identity 仓库接口 —— 认证与学习系统彻底分离（架构文档 §6）。
 * Domain 不依赖 Prisma；实现类在 infrastructure。
 */

import type {
  User,
  UserLearningProfile,
  Credential,
  EmailVerificationToken,
  PasswordResetToken,
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
  tokens: AuthTokenRepository;
}
