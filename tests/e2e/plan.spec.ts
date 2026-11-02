import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("plan shows week 1 open and live, later weeks coming soon; today points at the next lesson", async ({ page }) => {
  await page.goto("/plan");
  const wk1 = page.locator("details").first();
  await expect(wk1).toHaveAttribute("open", "");
  await expect(wk1.getByRole("link", { name: "Client–server and where state lives" })).toBeVisible();
  // Phases 1–2 are built, so week 1 is all live; week 7 (Phase 3) still has coming-soon items.
  await expect(wk1.getByText("· Coming soon")).toHaveCount(0);
  await page.locator("details").nth(8).locator("summary").click();
  await expect(page.locator("details").nth(8).getByText("· Coming soon").first()).toBeVisible();
  await page.locator("details").nth(4).locator("summary").click();
  await expect(page.locator("details").nth(4).getByText("Deliverable")).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText("Week 1 of 16")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next lesson" })).toBeVisible();
  await expect(page.locator("li", { has: page.getByRole("heading", { name: "Next lesson" }) }).getByRole("link")).toHaveAttribute("href", "/phase/1/client-server");
});

test("a plan start 3 weeks ago puts you in week 4 with a catch-up banner", async ({ page }) => {
  await page.goto("/settings");
  const d = new Date(Date.now() - 21 * 86_400_000);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Plan start date").fill(key);
  await page.goto("/today");
  await expect(page.getByText("Week 4 of 16")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "behind" })).toBeVisible();
});

test("export, import preview and typed reset", async ({ page }) => {
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all data" }).click()]);
  const file = await download.path();
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(json.app).toBe("sysdesign-lab");
  expect(JSON.stringify(json)).not.toContain("apiKey");

  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByText(/Import preview/)).toBeVisible();
  await page.getByRole("button", { name: "Merge with my data" }).click();
  await expect(page.getByText("Imported and merged")).toBeVisible();

  const reset = page.getByRole("button", { name: "Reset all progress" });
  await expect(reset).toBeDisabled();
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await reset.click();
  await expect(page.getByText("All progress was reset.")).toBeVisible();
});

test("dashboard renders stats and phase bars", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Overall")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Phase 7 progress" })).toBeVisible();
});
