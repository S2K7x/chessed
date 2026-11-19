import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const PGN = `[White "Legall"]
[Black "learner"]
[Date "2026.11.01"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0
`;

test('games analysed by the command line import into the app', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const dir = mkdtempSync(join(tmpdir(), 'chess-coach-cli-'));
  writeFileSync(join(dir, 'games.pgn'), PGN);
  const out = join(dir, 'backup.json');
  execFileSync('npm', ['run', '-s', 'analyse', '--', '--pgn', join(dir, 'games.pgn'), '--me', 'learner', '--no-lichess', '--depth', '10', '--out', out], {
    stdio: 'pipe',
  });

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type=file][accept*="json"]').setInputFiles(out);
  // Two mistakes of "learner", plus a blunder check for 5...Bxd1 (it allowed mate).
  await expect(page.locator('.nav .count')).toHaveText('3');
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await expect(page.locator('.library-item')).toContainText('Legall');
  await page.locator('.nav').getByRole('button', { name: 'Progress' }).click();
  await expect(page.getByText('1 analysed game')).toBeVisible();
});
