import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

for (const theme of ["paper", "blueprint"] as const) {
  for (const route of ROUTES) {
    test(`${route} loads in ${theme} without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((t) => localStorage.setItem("sdl-theme", t), theme);
      const res = await page.goto(route);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}

test("keyboard shortcuts open search and help", async ({ page }) => {
  await page.goto("/today");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("combobox", { name: "Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("main").click();
  await page.keyboard.press("?");
  await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
});
