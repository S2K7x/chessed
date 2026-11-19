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

test('a file with a broken game and games not separated by blank lines', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const dir = mkdtempSync(join(tmpdir(), 'chess-coach-file-'));
  // No blank line between games, and the second game has an illegal move.
  writeFileSync(
    join(dir, 'mixed.pgn'),
    '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n' +
      '[White "C"]\n[Black "D"]\n[Result "*"]\n\n1. e4 e5 2. Ke3 Ke6 3. Kxe5 *\n' +
      '[White "E"]\n[Black "F"]\n[Result "*"]\n\n1. d4 d5 *\n',
  );
  await page.goto('/');
  await page.locator('input[type=file][accept*="pgn"]').setInputFiles(join(dir, 'mixed.pgn'));
  await expect(page.getByRole('alert')).toContainText('2 games imported; 1 could not be read (game 2 (C – D): Illegal or unreadable move 2. Ke3.)');
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await expect(page.locator('.library .library-item')).toHaveCount(2);
});

test('a pasted PGN with several games keeps them all', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  await page.goto('/');
  await page.getByLabel('Game link or PGN').fill(FILE);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await expect(page.locator('.library .library-item')).toHaveCount(3);
});
