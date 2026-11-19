import { expect, test, type Page } from '@playwright/test';

const GAMES = [
  `[White "Legall"]
[Black "learner"]
[WhiteElo "1500"]
[BlackElo "1400"]
[Date "2026.11.01"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`,
  `[White "learner"]
[Black "rival"]
[Date "2026.11.02"]
[Result "0-1"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`,
];

async function analyse(page: Page, pgn: string) {
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByLabel('Game link or PGN').fill(pgn);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
}

test('progress dashboard, spaced training and backup', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  for (const pgn of GAMES) await analyse(page, pgn);

  // Each mistake of "learner" became a training card.
  await expect(page.locator('.nav .count')).toBeVisible();
  const due = Number(await page.locator('.nav .count').innerText());
  expect(due).toBeGreaterThanOrEqual(2);

  await page.locator('.nav').getByRole('button', { name: 'Progress' }).click();
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
  await expect(page.getByText('2 analysed games')).toBeVisible();
  await expect(page.locator('.chart svg')).toBeVisible();
  await expect(page.locator('.bars li').first()).toBeVisible();
  await expect(page.locator('.table tbody tr').first()).toBeVisible();
  await page.screenshot({ path: `test-results/progress-${info.project.name}.png`, fullPage: true });

  // Training: give up on the first position, then the session goes on.
  await page.getByRole('button', { name: 'Train now' }).click();
  await expect(page.getByText(/Position 1 of \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.hint-line')).toHaveCount(1);
  await page.screenshot({ path: `test-results/training-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Show the answer' }).click();
  await expect(page.getByText(/The move was/)).toBeVisible();
  const total = Number((await page.getByText(/Position 1 of \d+/).innerText()).match(/of (\d+)/)![1]);
  for (let i = 1; i < total; i++) {
    await page.getByRole('button', { name: 'Next position' }).click();
    await page.getByRole('button', { name: 'Show the answer' }).click();
  }
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible();
  await expect(page.locator('.nav .count')).toHaveCount(0);

  // Backup export.
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export a backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^chess-coach-.*\.json$/);

  expect(pageErrors).toEqual([]);
});
