import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FILE = [
  '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
  '[White "C"]\n[Black "D"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Ke7 3. Qxe5# 1-0',
  '[White "E"]\n[Black "F"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 *',
].join('\n\n');

test('a PGN file with several games: the others can be analysed in one go', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const dir = mkdtempSync(join(tmpdir(), 'chess-coach-file-'));
  writeFileSync(join(dir, 'games.pgn'), FILE);

  await page.goto('/');
  await page.locator('input[type=file][accept*="pgn"]').setInputFiles(join(dir, 'games.pgn'));
  // The first game opens and is analysed; the two others wait in the library.
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await expect(page.locator('.library .tag', { hasText: 'not analysed' })).toHaveCount(2);
  await expect(page.getByText('2 games are not analysed yet')).toBeVisible();

  await page.getByRole('button', { name: 'Analyse these 2 games' }).click();
  await expect(page.getByText(/Analysing game \d of 2/)).toBeVisible();
  await expect(page.locator('.library .tag', { hasText: 'not analysed' })).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByText(/games? (are|is) not analysed yet/)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
