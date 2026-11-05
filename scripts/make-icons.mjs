// Renders the app icons in public/icons, app/icon.svg and app/favicon.ico from the brand mark
// (components/brand MARK_PATHS), using Playwright's Chromium so no image library is needed.
// Run: node scripts/make-icons.mjs  (re-run only if the mark or the Paper colours change)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PAPER = "#F4EFE4"; // design/tokens.json → paper (Paper theme)
const INK = "#121212"; // → ink
const COBALT = "#3B4CF5"; // → cobalt

/** The brand mark (components/brand MARK_PATHS: one node fanning out to two servers) on a 32-unit tile, scaled into a square icon. */
function markSvg({ inset = 0, tileRadius = 7 } = {}) {
  const k = (32 - 2 * inset) / 32; // the mark shrinks inside the safe area for maskable icons
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
  <rect width="32" height="32" rx="${tileRadius}" fill="${INK}"/>
  <g transform="translate(${inset} ${inset}) scale(${k})">
    <path d="M16 11.5 L9 20 M16 11.5 L23 20" stroke="${PAPER}" stroke-width="2" fill="none"/>
    <circle cx="16" cy="10" r="4.25" fill="${COBALT}" stroke="${PAPER}" stroke-width="1.75"/>
    <rect x="4.5" y="19" width="9" height="8" rx="1.75" fill="${PAPER}"/>
    <rect x="18.5" y="19" width="9" height="8" rx="1.75" fill="${PAPER}"/>
  </g>
</svg>`;
}

const out = join(import.meta.dirname, "..", "public", "icons");
const any = markSvg();
// Maskable and Apple: full-bleed tile (the platform rounds it) with the mark inside the 80% safe circle.
const maskable = markSvg({ inset: 4, tileRadius: 0 });
writeFileSync(join(out, "icon.svg"), any);
writeFileSync(join(import.meta.dirname, "..", "app", "icon.svg"), any);

const browser = await chromium.launch();
const page = await browser.newPage();
const png = {};
for (const [name, svg, px] of [["icon-192.png", any, 192], ["icon-512.png", any, 512], ["icon-maskable-512.png", maskable, 512], ["apple-touch-icon.png", maskable, 180], ["fav-16", any, 16], ["fav-32", any, 32], ["fav-48", any, 48]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${px}" height="${px}"`)}</body></html>`);
  const buf = await page.locator("svg").screenshot({ omitBackground: true });
  if (name.startsWith("fav-")) { png[px] = buf; continue; }
  writeFileSync(join(out, name), buf);
  console.log("wrote", name);
}
// favicon.ico for browsers that ask for /favicon.ico: an ICO directory of PNG images (16, 32, 48).
const sizes = [16, 32, 48];
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((px, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(px, e); head.writeUInt8(px, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png[px].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += png[px].length;
});
writeFileSync(join(import.meta.dirname, "..", "app", "favicon.ico"), Buffer.concat([head, ...sizes.map((px) => png[px])]));
console.log("wrote app/favicon.ico and app/icon.svg");
await browser.close();
