/**
 * LoginUser Use Case —— 认证只回答"你是谁"（架构文档 §6）。
 * 凭据失败统一返回 UnauthorizedError（不泄露邮箱是否注册）。
 */

import { UnauthorizedError } from "@/shared/errors";
import type { User } from "../domain/user";
import type { IdentityRepositories } from "../domain/repositories";
import type { PasswordHasher } from "./password-hasher";

export interface LoginUserDeps {
  repos: IdentityRepositories;
  hasher: PasswordHasher;
}

export interface LoginUserCommand {
  email: string;
  password: string;
}

export interface LoginUserResult {
  user: User;
}

export class LoginUser {
  constructor(private readonly deps: LoginUserDeps) {}

  async execute(cmd: LoginUserCommand): Promise<LoginUserResult> {
    const { repos, hasher } = this.deps;
    const email = cmd.email.trim().toLowerCase();

    const user = await repos.users.findByEmail(email);
    const credential = user ? await repos.credentials.findByUserId(user.id) : null;
    const ok = credential ? await hasher.verify(cmd.password, credential.passwordHash) : false;
    if (!user || !ok) {
      throw new UnauthorizedError("邮箱或密码错误");
    }

    return { user };
  }
}
