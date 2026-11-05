// Renders the app icons in public/icons from the brand mark (the isometric stacked layers in
// components/brand Wordmark), using Playwright's Chromium so no image library is needed.
// Run: node scripts/make-icons.mjs  (re-run only if the mark or the Paper colours change)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PAPER = "#F4EFE4"; // design/tokens.json → paper (Paper theme)
const INK = "#121212"; // → ink
const COBALT = "#3B4CF5"; // → cobalt

/** The mark (viewBox 28×22) centred on a square paper tile; `fill` is the share of the tile's width it takes. */
function iconSvg(fill, { rounded }) {
  const size = 512;
  const w = size * fill;
  const s = w / 28;
  const x = (size - w) / 2;
  const y = (size - 22 * s) / 2;
  const stroke = 1.1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" ${rounded ? 'rx="64"' : ""} fill="${PAPER}"/>
  <g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round">
    <polygon points="14,1 27,7.5 14,14 1,7.5" fill="${COBALT}"/>
    <polygon points="1,11.5 14,18 27,11.5" fill="none"/>
    <polygon points="1,15 14,21.5 27,15" fill="none"/>
  </g>
</svg>`;
}

const out = join(import.meta.dirname, "..", "public", "icons");
const any = iconSvg(0.72, { rounded: true });
// Maskable: full-bleed background and the mark inside the 80% safe circle.
const maskable = iconSvg(0.56, { rounded: false });
writeFileSync(join(out, "icon.svg"), any);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg, px] of [["icon-192.png", any, 192], ["icon-512.png", any, 512], ["icon-maskable-512.png", maskable, 512], ["apple-touch-icon.png", maskable, 180]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${px}" height="${px}"`)}</body></html>`);
  await page.locator("svg").screenshot({ path: join(out, name), omitBackground: true });
  console.log("wrote", name);
}
await browser.close();
