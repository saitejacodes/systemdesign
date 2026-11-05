import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// At phone and tablet widths every control is at least 44×44 CSS px (WCAG 2.5.5), or has that much
// tappable room around it (the 2.5.8 spacing exception). Links inside running text are exempt.
for (const width of [375, 768]) {
  for (const route of ROUTES) {
    test(`${route} has 44px touch targets and no overflow at ${width}px`, async ({ page }) => {
      test.skip(test.info().project.name !== "mobile", "viewport is set per test");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
      const small = await page.evaluate(() => {
        const sel = "button, [role=button], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=switch], [role=checkbox], [role=radio], a";
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          if (el.closest("[inert], [aria-hidden=true], .react-flow__minimap, .react-flow__controls, nextjs-portal")) continue;
          const r = el.getBoundingClientRect();
          // Off-screen or visually hidden (sr-only, a skip link until focused) is not a touch target.
          if (r.width <= 1 || r.height <= 1 || r.right <= 0 || r.left >= window.innerWidth) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden") continue;
          // Inline links in running text are exempt.
          if (el.tagName === "A" && cs.display === "inline") continue;
          // A visually hidden native input wrapped by a big label counts as the label.
          const label = el.closest("label");
          const box = label && (el as HTMLInputElement).type && ["checkbox", "radio"].includes((el as HTMLInputElement).type) ? label.getBoundingClientRect() : r;
          if (box.width >= 44 && box.height >= 44) continue;
          // Spacing exception: a 44px circle centred on the target overlaps no other target.
          const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
          const crowded = Array.from(document.querySelectorAll<HTMLElement>(sel)).some((o) => {
            if (o === el || o.contains(el) || el.contains(o) || (label && label.contains(o))) return false;
            const q = o.getBoundingClientRect();
            if (q.width === 0 || q.height === 0) return false;
            const dx = Math.max(q.left - cx, 0, cx - q.right), dy = Math.max(q.top - cy, 0, cy - q.bottom);
            return dx * dx + dy * dy < 22 * 22;
          });
          if (!crowded) continue;
          const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 30);
          out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`);
        }
        return out;
      });
      expect(small).toEqual([]);
    });
  }
}
