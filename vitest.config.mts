import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Database tests read .env.test (see .env.test.example). Node's built-in loader; no dependency.
if (existsSync(".env.test")) process.loadEnvFile(".env.test");

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Database tests share one database and reset it: run files one at a time.
    fileParallelism: false,
  },
});
