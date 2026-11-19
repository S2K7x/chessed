// Renders public/icon.svg to the PNG icons of the web app manifest (run once,
// the PNGs are committed). Uses the Chromium installed with Playwright.
//   node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icon.svg', 'utf8');
// Full-bleed square (the platform rounds it), and the maskable one with the
// knight inside the 80 % safe zone.
const square = svg.replace(/ rx="96"/, '');
const maskable = square.replace(/<g fill/, '<g transform="translate(51.2 51.2) scale(0.8)" fill').replace(/<circle /, '<circle transform="translate(51.2 51.2) scale(0.8)" ');
const targets = [
  { file: 'public/icon-192.png', size: 192, svg },
  { file: 'public/icon-512.png', size: 512, svg },
  { file: 'public/apple-touch-icon.png', size: 180, svg: square },
  { file: 'public/icon-maskable-512.png', size: 512, svg: maskable },
];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.svg}`);
  await page.screenshot({ path: t.file, omitBackground: true });
  await page.close();
  console.log(t.file);
}
await browser.close();
