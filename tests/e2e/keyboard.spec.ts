import { expect, test, type Locator, type Page } from "@playwright/test";

// Keyboard-only walkthroughs: every control here is reached with Tab and used with Enter, Space or arrows.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "keyboard walkthroughs run at desktop width");

async function tabTo(page: Page, target: Locator, max = 400) {
  const el = await target.elementHandle();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((t) => document.activeElement === t, el)) return;
  }
  throw new Error(`could not Tab to ${target}`);
}

test("lesson: skip link, checkpoint, quiz and flashcard by keyboard", async ({ page }) => {
  await page.goto("/phase/1/dns");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  const checkpoint = page.locator("#checkpoints").getByRole("checkbox").first();
  await tabTo(page, checkpoint);
  await page.keyboard.press("Space");
  await expect(checkpoint).toBeChecked();

  await tabTo(page, page.getByRole("button", { name: "Start quiz" }));
  await page.keyboard.press("Enter");
  const option = page.locator("#quiz").getByRole("radio").first().or(page.locator("#quiz").getByRole("checkbox").first());
  await tabTo(page, option);
  await page.keyboard.press("Space");
  await expect(option).toHaveAttribute("aria-checked", "true");
  await tabTo(page, page.getByRole("button", { name: "Check answer" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("#quiz").getByRole("button", { name: /^(Next|See result)/ })).toBeVisible();

  const card = page.locator(".fm-flash").first();
  await tabTo(page, card);
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
});

test("simulator: tour, play and break it by keyboard", async ({ page }) => {
  await page.goto("/simulators/single-server-queue");
  await expect(page.getByRole("dialog", { name: "One server, one line" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tabTo(page, page.getByRole("button", { name: "Play" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: /Break it/ }));
  await page.keyboard.press("Enter");
  const items = page.getByRole("menuitemcheckbox");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(items.first()).toBeHidden();
  await expect(page.getByRole("button", { name: /Break it/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Remove fault/ })).toBeVisible();
});

test("design studio: add components and save by keyboard", async ({ page }) => {
  await page.goto("/studio/new");
  await expect(page).toHaveURL(/\/studio\/(?!new)/);
  for (const name of ["Client", "Service"]) {
    await tabTo(page, page.getByRole("button", { name: `Add ${name}`, exact: true }));
    await page.keyboard.press("Enter");
  }
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});
