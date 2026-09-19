/**
 * 进程内内存限流（Phase 13）—— 轻量滑动窗口。
 *
 * ⚠️ 本实现为【进程内】内存方案，仅适合单实例开发 / 测试。生产多实例部署必须换 Redis 分布式限流
 *    （key 存 Redis、用 Lua 原子计数），此处不引入外部依赖。
 *
 * 维度：key = `${clientIp}:${group}`（按 IP + 受保护路由分组）。
 * 窗口：滑动窗口 [now - windowMs, now]，记录每个 key 的时间戳队列；超出 max 即拒绝。
 * 阈值经 env 配置：RATE_LIMIT_MAX（窗口内最大请求数）/ RATE_LIMIT_WINDOW_MS（窗口毫秒）。
 */

export interface RateLimitOptions {
  /** 窗口内最大请求数（默认读 RATE_LIMIT_MAX，再默认 20） */
  max: number;
  /** 窗口毫秒数（默认读 RATE_LIMIT_WINDOW_MS，再默认 60000） */
  windowMs: number;
  /** 时钟注入（测试用） */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 触发限流后建议等待的秒数（Retry-After 头用） */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export function readRateLimitEnv(): Pick<RateLimitOptions, "max" | "windowMs"> {
  const envMax = Number(process.env.RATE_LIMIT_MAX);
  const envWindow = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return {
    max: Number.isFinite(envMax) && envMax > 0 ? Math.floor(envMax) : 20,
    windowMs: Number.isFinite(envWindow) && envWindow > 0 ? Math.floor(envWindow) : 60_000,
  };
}

export function createRateLimiter(opts: Partial<RateLimitOptions> = {}): RateLimiter {
  const base = readRateLimitEnv();
  const max = opts.max ?? base.max;
  const windowMs = opts.windowMs ?? base.windowMs;
  const now = opts.now ?? (() => Date.now());
  // key -> 窗口内已通过的请求时间戳队列
  const buckets = new Map<string, number[]>();

  return {
    check(key: string): RateLimitResult {
      const t = now();
      const cutoff = t - windowMs;
      const arr = buckets.get(key) ?? [];
      // 滑出窗口外的旧时间戳
      while (arr.length > 0 && arr[0]! <= cutoff) arr.shift();

      if (arr.length >= max) {
        // 最早一条还要多久滑出窗口
        const oldest = arr[0] ?? t;
        const retryAfterMs = Math.max(0, windowMs - (t - oldest));
        return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
      }
      arr.push(t);
      buckets.set(key, arr);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
