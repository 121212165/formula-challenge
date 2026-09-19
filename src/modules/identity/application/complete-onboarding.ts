/**
 * CompleteOnboarding Use Case —— 新手引导完成（Phase 5，BR-071 事务）。
 *
 * 职责边界（架构文档 §6：认证/偏好与学习状态彻底分离）：
 *   - 确保 UserLearningProfile 存在（注册时已建；这里幂等兜底，不重置学习数据）；
 *   - 按用户选择写入 UserSubjectPreference（选科目）；
 *   - 全程不触碰 LearningState / StudyDay / StudyPlan / StudySession。
 *
 * 同一事务内完成 profile 兜底 + 全部科目偏好写入，避免半成功。
 */

import { ValidationError } from "@/shared/errors";
import type { UnitOfWork } from "@/shared/domain/unit-of-work";
import type { UserLearningProfile, UserSubjectPreference } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";

export interface CompleteOnboardingDeps {
  repos: IdentityRepositories;
  uow: UnitOfWork;
  idGen?: () => string;
  now?: () => Date;
}

export interface CompleteOnboardingCommand {
  userId: string;
  /** 用户选择的科目 id 列表（至少一个） */
  subjectIds: string[];
}

export interface CompleteOnboardingResult {
  profile: UserLearningProfile;
  preferences: UserSubjectPreference[];
}

export class CompleteOnboarding {
  constructor(private readonly deps: CompleteOnboardingDeps) {}

  async execute(cmd: CompleteOnboardingCommand): Promise<CompleteOnboardingResult> {
    const { repos, uow } = this.deps;
    const now = this.deps.now ?? (() => new Date());

    const subjectIds = cmd.subjectIds.map((s) => s.trim()).filter(Boolean);
    if (subjectIds.length === 0) {
      throw new ValidationError("至少选择一个科目");
    }
    // 去重，保持顺序
    const uniqueSubjects = [...new Set(subjectIds)];

    const stamp = now();

    return uow.transaction(async () => {
      // 1) 用户必须存在（Onboarding 是登录后操作）
      const user = await repos.users.findById(cmd.userId);
      if (!user) {
        throw new ValidationError("用户不存在");
      }

      // 2) 兜底 UserLearningProfile（注册已建；幂等，不覆盖既有学习配置）
      let profile = await repos.profiles.findByUserId(cmd.userId);
      if (!profile) {
        profile = {
          userId: cmd.userId,
          dailyMinutes: 15,
          dailyItemTarget: 20,
          learningStage: "beginner",
          createdAt: stamp,
          updatedAt: stamp,
        };
        await repos.profiles.save(profile);
      }

      // 3) 写入科目偏好（按选择顺序给 priority）
      const preferences: UserSubjectPreference[] = uniqueSubjects.map((subjectId, index) => ({
        userId: cmd.userId,
        subjectId,
        enabled: true,
        priority: index,
        createdAt: stamp,
        updatedAt: stamp,
      }));
      for (const pref of preferences) {
        await repos.subjectPrefs.save(pref);
      }

      return { profile, preferences };
    });
  }
}
