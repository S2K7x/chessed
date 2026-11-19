import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A backup with `n` games, the oldest one played by "Oldest Player". */
function backup(n: number): string {
  const games = Array.from({ length: n }, (_, i) => ({
    id: `pgn:lib-${i}`,
    source: 'pgn',
    pgn: '1. e4 *',
    startFen: START,
    white: { name: i === n - 1 ? 'Oldest Player' : `Player ${i}` },
    black: { name: 'Rival' },
    result: '*',
    moves: [],
    importedAt: 1_800_000_000_000 - i * 1000,
  }));
  return JSON.stringify({ format: 'chess-coach-backup', version: 1, games, reviews: [], exercises: [] });
}

test('every game of a large library can be listed and found', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const dir = mkdtempSync(join(tmpdir(), 'chess-coach-lib-'));
  writeFileSync(join(dir, 'backup.json'), backup(230));
  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type=file][accept*="json"]').setInputFiles(join(dir, 'backup.json'));
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();

  // The newest 200 first, then the rest on demand.
  await expect(page.locator('.library .library-item')).toHaveCount(200);
  await expect(page.getByText('Oldest Player')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show 30 older games (30 more)' }).click();
  await expect(page.locator('.library .library-item')).toHaveCount(230);
  await expect(page.getByRole('button', { name: /older games/ })).toHaveCount(0);

  // A search covers every game, even those not loaded yet.
  await page.reload();
  await expect(page.locator('.library .library-item')).toHaveCount(200);
  await page.getByLabel('Search players or openings').fill('oldest');
  await expect(page.locator('.library .library-item')).toHaveCount(1);
  await expect(page.locator('.library .library-item')).toContainText('Oldest Player');
});
