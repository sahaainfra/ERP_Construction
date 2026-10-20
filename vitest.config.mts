import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests read .env.test (see .env.test.example). Node's built-in loader; no dependency.
if (existsSync(".env.test")) process.loadEnvFile(".env.test");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Database tests share one database and reset it: run files one at a time.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/db/**", "src/domain/**", "src/program/**", "src/testing/**", "src/core/**", "src/org/**", "src/iam/**"],
      exclude: ["**/*.test.ts", "**/*.generated.json", "**/*.d.ts"],
      // Floors from docs/erp-program/quality-gates.json (coverage.lines). Measured with the database tests enabled.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
