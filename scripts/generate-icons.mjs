// Renders the app icons (PWA, Apple touch, favicon) from the logo using the locally installed Edge.
//   node scripts/generate-icons.mjs
import { chromium } from "playwright-core";

const logo = (size, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="g" cx="20%" cy="0%" r="120%">
      <stop offset="0" stop-color="#7c3aed"/><stop offset=".55" stop-color="#1e1b4b"/><stop offset="1" stop-color="#080914"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
    <path d="M14 14 L46 46 M46 14 L14 46" stroke="#38bdf8" stroke-width="11" stroke-linecap="round" fill="none"/>
    <circle cx="70" cy="70" r="17" stroke="#f472b6" stroke-width="11" fill="none"/>
  </g>
</svg>`;

const targets = [
  ["public/icons/icon-192.png", 192, 8],
  ["public/icons/icon-512.png", 512, 8],
  ["public/icons/maskable-512.png", 512, 20], // content inside the maskable safe zone
  ["src/app/apple-icon.png", 180, 12],
  ["src/app/icon.png", 64, 6],
];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
for (const [path, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${logo(size, pad)}</body></html>`);
  await page.locator("svg").screenshot({ path, omitBackground: false });
  console.log("wrote", path);
}
await browser.close();
