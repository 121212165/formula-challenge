// 管理员鉴权:ADMIN_EMAILS 环境变量(逗号分隔)决定谁可进入后台审核
// 注意:动态读取 env,避免模块加载时缓存(测试/部署 env 变化后可即时生效)
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return getAdminEmails().includes(e);
}

export function hasAdminConfigured(): boolean {
  return getAdminEmails().length > 0;
}
