import { defineConfig } from "@playwright/test";

// End-to-end smoke at the three breakpoints of Part 00 §10 (phone 360x800, tablet 820x1180, desktop 1440x900).
// Locally, set PLAYWRIGHT_CHROMIUM_PATH to a Chromium binary when the Playwright download is unavailable.
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: chromium ? { executablePath: chromium, args: ["--no-sandbox"] } : {},
  },
  webServer: {
    command: process.env.CI ? "npm run start -- -p 3000" : "npm run dev -- -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "phone-360", use: { viewport: { width: 360, height: 800 } } },
    { name: "tablet-820", use: { viewport: { width: 820, height: 1180 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
