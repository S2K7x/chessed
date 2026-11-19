// Renders marketing/promo.html to an MP4, frame by frame.
//   node scripts/render-promo.mjs [--format landscape|portrait] [--fps 30] [--out media/chess-coach-promo.mp4]
// Needs the captures from scripts/capture-screens.mjs --plies in media/screens, and ffmpeg.
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const FORMAT = arg('format', 'landscape');
const FPS = Number(arg('fps', '30'));
const OUT = arg('out', `media/chess-coach-promo-${FORMAT}.mp4`);
const STILL = arg('still', ''); // render a single frame at this time to a PNG instead
const [W, H] = FORMAT === 'portrait' ? [1080, 1920] : [1920, 1080];
const frames = resolve(`media/.frames-${FORMAT}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${pathToFileURL(resolve('marketing/promo.html')).href}?format=${FORMAT}`);
await page.evaluate(() => window.ready);
if (STILL) {
  await page.evaluate((t) => window.renderAt(t), Number(STILL));
  await page.screenshot({ path: OUT });
  console.log(OUT);
} else {
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const duration = await page.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.renderAt(t), f / FPS);
    await page.screenshot({ path: `${frames}/${String(f).padStart(5, '0')}.png` });
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${frames}/%05d.png`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  await rm(frames, { recursive: true, force: true });
  console.log(OUT);
}
await browser.close();
