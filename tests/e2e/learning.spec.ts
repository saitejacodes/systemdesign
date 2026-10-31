import { expect, test } from "@playwright/test";

test("checkpoints persist, quiz runs to a result, cards go into review", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/phase/1/client-server");

  const first = page.locator("#checkpoints input[type=checkbox]").first();
  await first.click();
  await expect(page.getByText("1/5 done")).toBeVisible();
  await page.reload();
  await expect(page.locator("#checkpoints input[type=checkbox]").first()).toBeChecked();

  await page.getByRole("button", { name: "Start quiz" }).click();
  for (let i = 0; i < 10; i++) {
    const options = page.locator("#quiz .fm-opt");
    await options.first().click();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText(/· Why/)).toBeVisible();
    await page.locator("#quiz").getByRole("button", { name: /^(Next|See result)/ }).click();
  }
  await expect(page.getByRole("region", { name: "Quiz results" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry all" })).toBeVisible();

  await page.getByRole("button", { name: /Add all to review/ }).click();
  await expect(page.getByText("All 15 in review")).toBeVisible();
  await page.goto("/flashcards");
  await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await expect(page.getByText(/^1[34] due/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("notes autosave per page and show on the dashboard", async ({ page }) => {
  await page.goto("/phase/1/client-server");
  await page.keyboard.press("]");
  await page.getByLabel("Notes for this page (Markdown)").fill("# Stateless tier\nSessions go to Redis.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await page.goto("/dashboard");
  await expect(page.getByText("Sessions go to Redis.")).toBeVisible();
});
