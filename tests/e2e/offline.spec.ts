import { expect, type Page, test } from "@playwright/test";

// The service worker (app/sw.ts) only exists in production builds, which is what this suite runs against.
// Each test gets a fresh browser context, so caches never leak between tests.
test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "service worker checks use Chromium");

const LESSON = "/phase/1/client-server";

/** Waits until the worker controls the page and has cached the page's HTML and every build file it loaded. */
async function waitUntilCached(page: Page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active && reg.active.state === "activated" && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(async () => {
      const pages = await caches.open("sdl-pages-v2");
      const statics = await caches.open("sdl-static-v2");
      const want = performance.getEntriesByType("resource").map((e) => new URL(e.name)).filter((u) => u.origin === location.origin && u.pathname.startsWith("/_next/static/") && /\.(js|css)$/.test(u.pathname));
      const have = await Promise.all(want.map((u) => statics.match(u.pathname).then((r) => !!r || caches.match(u.pathname).then((p) => !!p))));
      return !!(await pages.match(location.pathname)) && have.every(Boolean);
    }), { timeout: 20_000 })
    .toBe(true);
}

test("the service worker registers, activates and precaches the app shell", async ({ page }) => {
  await page.goto("/today");
  await waitUntilCached(page);
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    const precache = names.find((n) => n.includes("precache"));
    const keys = precache ? (await (await caches.open(precache)).keys()).map((r) => new URL(r.url).pathname) : [];
    return { script: reg?.active?.scriptURL ?? "", scope: reg?.scope ?? "", names, keys };
  });
  expect(new URL(info.script).pathname).toBe("/serwist/sw.js");
  expect(new URL(info.scope).pathname).toBe("/");
  expect(info.keys).toContain("/offline");
  expect(info.keys.some((k) => k.endsWith(".css"))).toBe(true);
  // Nothing from an AI provider is ever cached.
  expect(info.names.join(" ")).not.toMatch(/anthropic|openai|groq|openrouter|generativelanguage/);
});

test("a visited lesson reloads offline; an unvisited page shows the offline fallback", async ({ page, context }) => {
  await page.goto(LESSON);
  const title = (await page.locator("h1").first().textContent())?.trim();
  expect(title).toBeTruthy();
  await waitUntilCached(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1").first()).toHaveText(title!);
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();

  await page.goto("/phase/2/sharding");
  await expect(page.getByRole("heading", { level: 1, name: /You're offline/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Retry/ })).toBeVisible();
  await context.setOffline(false);
});

test("the web app manifest is served with valid icons", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.name).toBe("SysDesign Lab");
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
  const pngs = m.icons.filter((i: { type: string }) => i.type === "image/png");
  expect(pngs.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toContain(icon.type);
    if (icon.type === "image/png") {
      const b = await r.body();
      // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
      expect(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
    }
  }
});
