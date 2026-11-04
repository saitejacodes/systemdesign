import { expect, test } from "@playwright/test";

const list = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Resources" });

test("resources page loads without console errors and pins the classics", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/resources");
  await expect(page.locator("h1")).toBeVisible();
  const classics = page.locator("section", { has: page.getByRole("heading", { name: "Start here: the classics" }) });
  await expect(classics.getByRole("link", { name: "Designing Data-Intensive Applications" })).toHaveAttribute("rel", "noreferrer");
  await expect(list(page).locator("li").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("searching an author finds the book", async ({ page }) => {
  await page.goto("/resources");
  await page.getByLabel("Search title, author or why").fill("Kleppmann");
  await expect(list(page).getByRole("link", { name: "Designing Data-Intensive Applications" })).toBeVisible();
  await expect(page).toHaveURL(/q=Kleppmann/);
});

test("kind filter shows only papers", async ({ page }) => {
  await page.goto("/resources");
  await page.getByLabel("Kind").selectOption("paper");
  await expect(page).toHaveURL(/kind=paper/);
  const items = list(page).locator("li");
  await expect(items.first()).toBeVisible();
  const kinds = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  expect(new Set(kinds)).toEqual(new Set(["paper"]));
});

test("phase filter survives a reload and clear filters resets", async ({ page }) => {
  await page.goto("/resources");
  const status = page.getByText(/^\d+ of \d+ resources$/);
  const total = (await status.textContent())!;
  await page.getByRole("button", { name: /^Phase 6:/ }).click();
  await expect(page).toHaveURL(/phase=6/);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Phase 6:/ })).toHaveAttribute("aria-pressed", "true");
  await expect(status).not.toHaveText(total);
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/phase=/);
  await expect(status).toHaveText(total);
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
});
