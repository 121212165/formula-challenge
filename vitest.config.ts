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
    include: [
      "src/tests/unit/**/*.test.ts",
      "src/tests/integration/**/*.test.ts",
      "src/tests/e2e/**/*.test.ts",
    ],
  },
});
