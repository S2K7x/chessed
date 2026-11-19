// Renders the Instagram carousel (marketing/instagram.html) to 1080×1350 PNGs.
//   node scripts/render-instagram.mjs [--acc 94.9,81.3] [--out media/instagram]
// --acc: the accuracies shown in media/screens/desktop-02-summary.png (White, Black).
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg('out', 'media/instagram');
const ACC = arg('acc', '');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (let n = 1; n <= 6; n++) {
  await page.goto(`${pathToFileURL(resolve('marketing/instagram.html')).href}?slide=${n}${ACC ? `&acc=${ACC}` : ''}`);
  await page.evaluate(() => window.ready);
  await page.screenshot({ path: `${OUT}/chess-coach-${n}.png` });
  console.log(`${OUT}/chess-coach-${n}.png`);
}
await browser.close();
