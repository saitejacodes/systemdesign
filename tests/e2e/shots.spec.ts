import { test } from "@playwright/test";
// Dev tool: SHOT_DIR=/tmp/x SHOT_PAGES=/,/today pnpm test:e2e shots --project=desktop
const OUT = process.env.SHOT_DIR!;
const pages = (process.env.SHOT_PAGES ?? "/").split(",");
test.skip(!OUT, "set SHOT_DIR to take screenshots");
for (const theme of ["paper", "blueprint"]) for (const [w, h] of [[1440, 900], [390, 844]]) for (const p of pages)
  test(`shot ${p} ${theme} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((t) => localStorage.setItem("sdl-theme", t), theme);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(p);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${p.replace(/\W+/g, "_") || "home"}-${theme}-${w}.png`, fullPage: w === 1440 && p === "/" });
  });
