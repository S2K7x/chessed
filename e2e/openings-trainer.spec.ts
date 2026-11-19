import { expect, test, type Page } from '@playwright/test';

const GAMES = [
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7 5. O-O O-O 1-0',
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 1-0',
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0',
].map((moves, i) => `[White "learner"]\n[Black "rival${i}"]\n[Result "1-0"]\n\n${moves}`);

async function play(page: Page, move: string) {
  await page.getByLabel('Type a move').fill(move);
  await page.getByLabel('Type a move').press('Enter');
}

test('trains your openings from your own games', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  for (const pgn of GAMES) {
    await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
    await page.getByLabel('Game link or PGN').fill(pgn);
    await page.getByRole('button', { name: 'Analyse' }).click();
    await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
  }

  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Train your openings' }).click();
  await expect(page.getByText('positions known · from 3 games')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Train as black' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Train as white' }).click();

  // 1. e4 and 2. Nf3 are the repertoire in every line.
  await expect(page.getByRole('heading', { name: 'Your move: what do you play here?' })).toBeVisible();
  await play(page, 'e4');
  await expect(page.getByText('Right: e4.')).toBeVisible();
  await play(page, 'Nf3');
  await expect(page.getByText('Right: Nf3.')).toBeVisible();
  await page.screenshot({ path: `test-results/openings-${info.project.name}.png`, fullPage: true });

  // A move outside the repertoire is corrected.
  await play(page, 'a3');
  await expect(page.locator('.verdict-bad')).toContainText('a3 is not your repertoire move. Play');
  await page.getByRole('button', { name: /^Continue with / }).click();
  await expect(page.getByText(/Your move: what do you play here\?|End of your games|Line complete/).first()).toBeVisible();
  await page.getByRole('button', { name: /^(Stop|Done)$/ }).click();

  // Back on the start screen: the positions answered right count as known.
  await expect(page.getByRole('heading', { name: 'Your openings' })).toBeVisible();
  await expect(page.locator('.opening-sides h2')).toHaveText(/^2 \/ \d+$/);
  expect(pageErrors).toEqual([]);
});
