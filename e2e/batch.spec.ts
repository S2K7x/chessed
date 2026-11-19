import { expect, test } from '@playwright/test';

// Three short games of "learner", as the Lichess API returns them (PGN, with Site).
const GAMES = [
  ['aaaaaaaa', 'learner', 'rival', '0-1', '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'],
  ['bbbbbbbb', 'rival', 'learner', '1-0', '1. e4 e5 2. Qh5 Ke7 3. Qxe5# 1-0'],
  ['cccccccc', 'learner', 'other', '1-0', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 1-0'],
]
  .map(
    ([id, white, black, result, moves]) => `[Event "Rated blitz game"]
[Site "https://lichess.org/${id}"]
[Date "2026.11.10"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]
[TimeControl "180+2"]

${moves}
`,
  )
  .join('\n');

test('analyses all recent games in the background', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: GAMES }),
  );

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByRole('button', { name: 'From Lichess (learner)' }).click();
  await expect(page.locator('.recent .library-item')).toHaveCount(3);

  // One game analysed first, from the list: two remain.
  await page.locator('.recent .library-open').first().click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByRole('button', { name: 'From Lichess (learner)' }).click();
  await expect(page.locator('.recent .tag', { hasText: 'analysed' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Analyse all 2 new games' }).click();
  await expect(page.getByText(/Analysing game \d of 2/)).toBeVisible();
  await page.screenshot({ path: `test-results/batch-${info.project.name}.png`, fullPage: true });
  await expect(page.getByText('All these games are analysed.')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.recent .tag', { hasText: 'analysed' })).toHaveCount(3);
  await expect(page.locator('.library .library-item')).toHaveCount(3);

  // Their mistakes became training positions.
  await expect(page.locator('.nav .count')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
