import { expect, test, type Page } from "@playwright/test";

const SHEETS = [
  "latency-numbers", "availability-nines", "estimation", "database-selection", "caching-strategies", "consistency-models",
  "messaging-semantics", "reliability-patterns", "interview-framework", "tradeoffs-glossary", "interview-day-checklist",
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}

test("/reference lists all 11 cheat sheets", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/reference");
  await expect(page.locator("h1")).toContainText("cheat");
  for (const slug of SHEETS) await expect(page.locator(`main a[href="/reference/${slug}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const slug of ["interview-day-checklist", "availability-nines"]) {
  test(`/reference/${slug} renders without console errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(`/reference/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".lesson.sheet table").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lessons behind this sheet" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("the final-review lesson's checklist link resolves", async ({ page }) => {
  await page.goto("/reference/interview-day-checklist");
  await expect(page.locator("h1")).toContainText("checklist");
  await expect(page.getByRole("heading", { name: "The night before (D-1)" })).toBeVisible();
});

test("an unknown sheet is a 404", async ({ page }) => {
  const res = await page.goto("/reference/no-such-sheet");
  expect(res?.status()).toBe(404);
});

test("print media hides the app chrome and keeps the sheet", async ({ page }) => {
  await page.goto("/reference/latency-numbers");
  const sidebar = page.locator('aside[aria-label="Sidebar"]');
  await expect(page.locator(".lesson.sheet")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(sidebar).toBeHidden();
  await expect(page.locator(".fm-hud")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.locator(".lesson.sheet")).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
});
