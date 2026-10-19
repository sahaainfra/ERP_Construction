// Known-bad fixture (Part 04 §17): the accessibility gate must fail on this page.
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the accessibility gate rejects an image without alt text and a button without a name", async ({ page }) => {
  await page.setContent('<main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /><button></button></main>');
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const ids = results.violations.map((v) => v.id);
  expect(ids).toEqual(expect.arrayContaining(["image-alt", "button-name"]));
});
