import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// Security headers on every route, and zero CSP violations while each page loads and settles (Prompt 24).
test.describe("security headers and CSP", () => {
  // Lessons that embed the SQL sandbox boot PGlite before the network goes idle; slow CI machines need longer.
  test.describe.configure({ timeout: 90_000 });
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "headers do not depend on the viewport");

  for (const route of ROUTES) {
    test(`${route} sends the headers and has no CSP violations`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __csp: string[] }).__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const consoleCsp: string[] = [];
      page.on("console", (m) => /Content Security Policy/i.test(m.text()) && consoleCsp.push(m.text()));
      const res = await page.goto(route, { waitUntil: "networkidle" });
      const h = res!.headers();
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["cross-origin-embedder-policy"]).toBeUndefined();
      expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
      expect(consoleCsp).toEqual([]);
    });
  }

  test("lab workers get eval, pages do not; the service worker script is never cached", async ({ request }) => {
    const worker = await request.get("/labs/js-worker.js");
    expect(worker.headers()["content-security-policy"]).toContain("'unsafe-eval'");
    const page = await request.get("/about");
    expect(page.headers()["content-security-policy"]).not.toContain("'unsafe-eval'");
    const sw = await request.get("/serwist/sw.js");
    expect(sw.headers()["cache-control"]).toContain("no-store");
  });
});
