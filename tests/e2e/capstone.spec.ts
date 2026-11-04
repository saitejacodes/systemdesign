import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}

for (const route of ["/capstone", "/capstone/0", "/capstone/10"]) {
  test(`${route} loads without console errors or horizontal scroll`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

/** The stored CheckpointState for `id`, read straight from IndexedDB. */
const storedDone = (page: Page, id: string) => page.evaluate((key) => new Promise<boolean>((resolve) => {
  const open = indexedDB.open("sysdesign-lab");
  open.onsuccess = () => {
    const get = open.result.transaction("checkpoints").objectStore("checkpoints").get(key);
    get.onsuccess = () => { resolve(Boolean(get.result?.done)); open.result.close(); };
    get.onerror = () => resolve(false);
  };
  open.onerror = () => resolve(false);
}), id);

test("the overview shows the architecture, coverage matrix, stages and Break-it list", async ({ page }) => {
  await page.goto("/capstone");
  await expect(page.getByRole("img", { name: /Capstone architecture/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /Coverage matrix/ })).toBeVisible();
  await expect(page.getByTestId("capstone-progress")).toHaveText(/\d+\/10 stages built/);
  await expect(page.locator('a[href^="/capstone/"]').filter({ hasText: "Load testing" }).first()).toBeVisible();
  await expect(page.locator('input[data-checkpoint^="capstone-break-"]')).toHaveCount(8);
});

test("a ticked stage checkpoint persists across reload and counts on the dashboard", async ({ page }) => {
  await page.goto("/capstone/3");
  const box = page.locator('input[data-checkpoint="capstone-3-1"]');
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await expect.poll(() => storedDone(page, "capstone-3-1")).toBe(true);
  await page.reload();
  await expect(page.locator('input[data-checkpoint="capstone-3-1"]')).toBeChecked();
  await page.goto("/dashboard");
  await expect(page.getByTestId("capstone-dashboard")).toHaveText(/Capstone 1\/\d+ checkpoints/);
});

test("a Break-it checkbox persists across reload", async ({ page }) => {
  await page.goto("/capstone");
  const box = page.locator('input[data-checkpoint="capstone-break-4"]');
  await expect(box).toBeEnabled();
  await box.check();
  await expect.poll(() => storedDone(page, "capstone-break-4")).toBe(true); // the tick shows before the write lands
  await page.reload();
  await expect(page.locator('input[data-checkpoint="capstone-break-4"]')).toBeChecked();
});

test("the zip download is a valid zip with every stage folder", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/capstone");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download the project/ }).click()]);
  expect(download.suggestedFilename()).toBe("sysdesign-capstone-llm-platform.zip");
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  const names = Object.keys(zip.files);
  const root = "sysdesign-capstone-llm-platform/";
  expect(names).toContain(`${root}README.md`);
  for (const dir of ["stage-00-design-review", "stage-01-model-server", "stage-05-rate-limits", "stage-10-load-test-capacity"]) {
    expect(names.some((n) => n.startsWith(`${root}${dir}/`)), dir).toBe(true);
  }
  expect(names.filter((n) => /^sysdesign-capstone-llm-platform\/stage-\d{2}-[^/]+\/README\.md$/.test(n))).toHaveLength(11);
  expect(names).toContain(`${root}stage-10-load-test-capacity/k6/step.js`);
  const readme = await zip.file(`${root}README.md`)!.async("string");
  expect(readme).toMatch(/Break-it checklist/);
  expect(Number(zip.file(`${root}stage-01-model-server/scripts/download-models.sh`)!.unixPermissions) & 0o111).toBeTruthy();
});
