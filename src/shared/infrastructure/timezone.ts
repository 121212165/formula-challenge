/**
 * getLocalDate 生产实现（P2-10 / BR-061 / BR-093）。
 *
 * 按用户 IANA 时区把一个 UTC 时刻换算成该用户的本地日期 "YYYY-MM-DD"。
 * FinalizeReviewDeps / EndSessionDeps 中 getLocalDate 是注入接口，
 * 这里提供唯一的生产工厂；测试可继续用 mock，不必替换。
 *
 * 仅依赖 Node 内置 Intl，不引入新第三方依赖。
 */

/** 最小用户仓库接口：只要能按 id 读到 timezone */
export interface TimezoneUserRepository {
  findById(id: string): Promise<{ timezone: string } | null>;
}

export interface CreateGetLocalDateRepos {
  users: TimezoneUserRepository;
}

/**
 * 返回符合 `(userId: string, now: Date) => Promise<string>` 签名的函数。
 * 用户不存在或其时区非法时回退 UTC 并告警，不抛错（业务日期不因此中断）。
 */
export function createGetLocalDate(repos: CreateGetLocalDateRepos) {
  return async function getLocalDate(userId: string, now: Date): Promise<string> {
    const user = await repos.users.findById(userId);
    let timeZone = user?.timezone;

    if (!user) {
      console.warn(`[getLocalDate] 用户 ${userId} 不存在，回退 UTC`);
      timeZone = "UTC";
    } else if (!isValidTimezone(timeZone)) {
      console.warn(`[getLocalDate] 用户 ${userId} 的时区非法（${timeZone}），回退 UTC`);
      timeZone = "UTC";
    }

    // en-CA locale 原生输出 "YYYY-MM-DD"，无需手工拼接（BR-061）
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  };
}

function isValidTimezone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
