// Captures the app's main screens at desktop and phone sizes, for the README,
// release notes and social posts. Drives the real app with Playwright, so the
// analysis shown is Stockfish's own.
//
//   node scripts/capture-screens.mjs [--url http://localhost:5173] [--out media/screens] [--theme dark|light]
//                                    [--only desktop|mobile] [--plies]
//
// Needs a running dev or preview server (cross-origin isolated).
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:5173');
const OUT = arg('out', 'media/screens');
const THEME = arg('theme', 'dark');
const ONLY = arg('only', '');
const PLIES = process.argv.includes('--plies');

const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
].filter((s) => !ONLY || s.name === ONLY);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

for (const size of SIZES) {
  const context = await browser.newContext({ ...size, locale: 'en-US', colorScheme: THEME });
  const page = await context.newPage();
  const shot = async (name, opts = {}) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${size.name}-${name}.png`, ...opts });
    console.log(`${size.name}-${name}`);
  };
  const nav = (label) => page.locator('.nav').getByRole('button', { name: label }).click();

  await page.goto(BASE);
  await page.getByRole('heading', { name: 'How it works' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await shot('01-home');

  // Morphy's Opera Game: the built-in example, analysed on the device.
  await page.getByRole('button', { name: 'Try it on an example game' }).click();
  await page.getByText('Game summary').waitFor({ timeout: 180_000 });
  await page.locator('.refining').waitFor({ state: 'detached', timeout: 180_000 }).catch(() => undefined);
  await page.mouse.move(0, 0);
  await shot('02-summary');
  if (size.isMobile) await shot('02-summary-full', { fullPage: true });

  // Highlighted moves with their explanation: a good find and an error.
  for (const group of [['brilliant', 'great'], ['blunder', 'mistake']]) {
    for (const cls of group) {
      const cell = page.locator('.movelist-cell').filter({ has: page.locator(`.badge[data-class="${cls}"]`) }).first();
      if (!(await cell.count())) continue;
      await cell.click();
      await page.locator('.coach-summary').first().waitFor();
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(`03-move-${cls}`);
      if (size.isMobile) {
        await page.locator('.coach').first().scrollIntoViewIfNeeded();
        await shot(`04-coach-${cls}`);
      }
      break;
    }
  }

  // Every position of the game, one frame per move, for the promo video.
  if (PLIES) {
    await mkdir(`${OUT}/plies`, { recursive: true });
    await page.keyboard.press('Home').catch(() => undefined);
    await page.locator('.board-controls button').first().click();
    // No focus ring on the button in the pictures; the arrow keys still work.
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (let i = 0; ; i++) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/plies/${size.name}-${String(i).padStart(2, '0')}.png` });
      if (await page.locator('.result-banner').count()) break;
      await page.keyboard.press('ArrowRight');
    }
    console.log(`${size.name}-plies`);
  }

  await nav('Progress');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('05-progress');

  await nav(/Training/);
  await page.waitForTimeout(800);
  await shot('06-training');

  await nav('Games');
  await page.waitForTimeout(500);
  await shot('07-library');

  await context.close();
}
await browser.close();
