// Part 14 S2 PWA checks: the manifest and service worker are served, the worker registers and takes control, and an offline
// navigation shows the offline page rather than a browser error (REQ-FIELD-F05).
import { expect, test } from "@playwright/test";

test("the manifest is served with the app name, standalone display and brand colours", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "ERP Construction", short_name: "ERP", start_url: "/", scope: "/", display: "standalone" });
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("the service worker is served as JavaScript and carries its version", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
  expect(await response.text()).toContain("erp-sw-v1");
});

test("the service worker registers, takes control and precaches the offline page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first visit is not controlled until the worker claims the page, which reloads it once (see PwaControls).
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null).catch(() => false), { timeout: 30_000 })
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const hit = await caches.match("/offline.html");
    return hit ? hit.text() : null;
  });
  expect(cached).toContain("You are offline");
});

// Not covered here: the offline navigation fallback. Playwright's offline emulation and route aborts do not fail the service
// worker's own fetch, so the worker answers with the network page. The fallback is verified by the sandbox tests in
// src/field/pwa.test.ts and needs a real-device check (see the Part 14 S2 record).
