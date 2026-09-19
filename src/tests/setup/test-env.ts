/**
 * 测试环境前置（setupFiles，每个 worker 在跑测试前执行一次）。
 *
 * 为什么在这里设 env 而不是改生产默认？
 *   生产默认限流 RATE_LIMIT_MAX=20 / RATE_LIMIT_WINDOW_MS=60000 是有意的防护阈值；
 *   但既有集成测试文件经真实 server 跑整个文件的多个用例，全程来自 127.0.0.1，
 *   在同一 60s 窗口内累计 register/login/attempts/review/content-issues 容易超过 20，
 *   被默认限流误杀成 flaky。故在【测试侧】把阈值放到极大，使测试环境默认不触发限流。
 *
 * 需要真正验证 429 的用例（phase13-production.test.ts）会显式注入小阈值，不受此 env 影响。
 */
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ?? "1000000";
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ?? "60000";
