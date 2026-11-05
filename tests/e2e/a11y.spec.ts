import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// Every route, both themes: no serious or critical axe violations (WCAG 2.1 A/AA rules).
// Reduced motion so colours are read at rest, not halfway through a hover or theme transition.
test.use({ reducedMotion: "reduce" });

for (const theme of ["paper", "blueprint"] as const) {
  for (const route of ROUTES) {
    test(`${route} has no serious axe violations in ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("sdl-theme", t), theme);
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
      const bad = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(bad).toEqual([]);
    });
  }
}
