// Part 12 S3 accessibility and state checks. Each template and state is rendered to static HTML (e2e/fixtures/render-cases.tsx, run
// through tsx) and checked with axe in each theme.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "src/design/tokens.css"), "utf8") + readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const THEMES = ["light", "dark", "high-contrast"] as const;
const cases: { name: string; html: string; expect: string }[] = JSON.parse(
  execFileSync("npx", ["tsx", "--tsconfig", "e2e/fixtures/tsconfig.json", "e2e/fixtures/render-cases.tsx"], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim().split("\n").pop()!,
);

test.describe("templates and states are accessible in every theme", () => {
  for (const theme of THEMES) {
    for (const c of cases) {
      test(`${c.name} (${theme})`, async ({ page }) => {
        const html = `<!doctype html><html lang="en-IN" data-theme="${theme}" data-density="cozy"><head><title>ERP Construction</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head><body>${c.html}</body></html>`;
        await page.setContent(html);
        await expect(page.locator("body")).toContainText(c.expect);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  }
});
