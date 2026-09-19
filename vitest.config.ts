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
    include: [
      "src/tests/unit/**/*.test.ts",
      "src/tests/integration/**/*.test.ts",
      "src/tests/e2e/**/*.test.ts",
    ],
  },
});
