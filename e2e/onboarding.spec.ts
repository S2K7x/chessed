import { expect, test } from '@playwright/test';

const GAMES = `[Event "Rated blitz game"]
[Site "https://lichess.org/aaaaaaaa"]
[Date "2026.11.10"]
[White "newcomer"]
[Black "rival"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0
`;

test('a first visit lists your games from the home page', async ({ page }) => {
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: GAMES }),
  );
  await page.goto('/');
  // No account yet: the usernames are asked here, not in Settings.
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  const show = page.getByRole('button', { name: 'Show my games' });
  await expect(show).toBeDisabled();
  await page.getByLabel('Lichess username').fill(' newcomer ');
  await show.click();
  await expect(page.locator('.recent .library-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'From Lichess (newcomer)' })).toBeVisible();

  // The username was saved for the next visits.
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Lichess username')).toHaveValue('newcomer');
});

test('the example game can be analysed without importing anything', async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try it on an example game' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Paul Morphy').first()).toBeVisible();
  // Back home, the game is in the library and the first steps make way for it.
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await expect(page.getByRole('heading', { name: 'Analysed games' })).toBeVisible();
  await expect(page.locator('.library .library-item')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
