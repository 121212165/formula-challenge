import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // 每个 worker 跑测试前：放宽限流阈值，避免既有集成测试被默认限流误杀（生产默认仍 20）。
    setupFiles: ["./src/tests/setup/test-env.ts"],
    globalSetup: ["./src/tests/integration/setup/global-setup.ts"],
    // Phase 13 后：生产包装层给每请求加了 ALS/结构化日志/审计写库开销，重型 node:http
    // 闭环用例在背靠背高负载下贴近原默认 5s 上限，集体 flaky 超时。全局提到 20s。
    testTimeout: 20000,
    include: [
      "src/tests/unit/**/*.test.ts",
      "src/tests/integration/**/*.test.ts",
      "src/tests/e2e/**/*.test.ts",
    ],
  },
});
