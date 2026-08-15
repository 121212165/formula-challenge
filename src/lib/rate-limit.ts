// 轻量内存限流(单实例滑动窗口)
// 说明:Vercel Serverless 多实例时内存不共享,此实现只做基础缓解;
//      生产环境强烈建议换用 Upstash Ratelimit(Redis)或数据库计数器。
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 判断是否放行;超限返回 false。
 * @param key   限流键,如 `register:${ip}`
 * @param limit 窗口内最大次数
 * @param windowMs 窗口时长(毫秒)
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** 从请求头取客户端 IP(Vercel 经 x-forwarded-for 代理) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/** 定期清理过期桶,避免内存无限增长 */
export function sweepBuckets(now = Date.now()): void {
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}
