// Renders public/icon.svg to the PNG icons of the web app manifest (run once,
// the PNGs are committed). Uses the Chromium installed with Playwright.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, file, pad] of [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-maskable-512.png', 56], [180, 'apple-touch-icon.png', 0]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = size - 2 * pad;
  await page.setContent(`<body style="margin:0;background:#2f6f5e"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('icons written');
