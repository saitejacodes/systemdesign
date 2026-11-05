import { expect, test } from "@playwright/test";

// Under prefers-reduced-motion no CSS animation or transition runs; lessons never show the drafting grid
// (an embedded simulator's canvas may: CLAUDE.md §5 allows it in simulator canvases).
test.use({ reducedMotion: "reduce" });

for (const route of ["/", "/today", "/phase/1/scaling", "/simulators/load-balancer", "/capstone"]) {
  test(`${route} runs no animations under reduced motion`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(300);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName ?? a.constructor.name));
    expect(running).toEqual([]);
  });
}

test("lesson pages have no drafting grid or crosshair marks", async ({ page }) => {
  await page.goto("/phase/2/sharding");
  await expect(page.locator("h1").first()).toBeVisible();
  const marks = page.locator("main :is(.fm-grid, .gridbg, .cross, .fm-cross)");
  expect(await marks.evaluateAll((els) => els.filter((e) => !e.closest("[data-sim-embed]")).length)).toBe(0);
});
