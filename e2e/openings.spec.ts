import { expect, test } from '@playwright/test';

const EXPLORER = {
  white: 600,
  draws: 300,
  black: 100,
  opening: { eco: 'C41', name: 'Philidor Defense' },
  moves: [
    { uci: 'd2d4', san: 'd4', white: 400, draws: 200, black: 50, averageRating: 2400 },
    { uci: 'f1c4', san: 'Bc4', white: 150, draws: 80, black: 40, averageRating: 2350 },
  ],
};

test('Lichess login (PKCE) and the opening explorer', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  let tokenRequest = '';
  await page.route('https://lichess.org/oauth?**', async (route) => {
    const u = new URL(route.request().url());
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const back = new URL(u.searchParams.get('redirect_uri')!);
    back.searchParams.set('code', 'the-code');
    back.searchParams.set('state', u.searchParams.get('state')!);
    await route.fulfill({ status: 302, headers: { Location: back.toString() } });
  });
  await page.route('https://lichess.org/api/token', async (route) => {
    tokenRequest = route.request().postData() ?? '';
    await route.fulfill({ json: { access_token: 'lichess-token' }, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('https://lichess.org/api/account', (route) =>
    route.fulfill({ json: { username: 'learner' }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  let explorerAuth = '';
  await page.route('https://explorer.lichess.ovh/**', async (route) => {
    explorerAuth = route.request().headers().authorization ?? '';
    await route.fulfill({ json: EXPLORER, headers: { 'Access-Control-Allow-Origin': '*' } });
  });

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Connect Lichess' }).click();
  await expect(page.getByText('Lichess account connected')).toBeVisible();
  expect(tokenRequest).toContain('code=the-code');
  expect(tokenRequest).toContain('code_verifier=');
  await expect(page.getByLabel('Lichess username')).toHaveValue('learner');

  // Two games of "learner": the second shows what was played in the first.
  for (const pgn of [
    '[White "learner"]\n[Black "a"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 1-0',
    '[White "learner"]\n[Black "b"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 d6 3. d4 0-1',
  ]) {
    await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
    await page.getByLabel('Game link or PGN').fill(pgn);
    await page.getByRole('button', { name: 'Analyse' }).click();
    await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  }
  await page.locator('.movelist-cell', { hasText: 'd4' }).click();
  await expect(page.locator('.opening-panel')).toContainText('In your other games here you played Bc4 ×1');
  await page.getByRole('button', { name: 'Masters' }).click();
  await expect(page.locator('.explorer')).toContainText('1,000 games');
  await expect(page.locator('.explorer tr.is-played')).toContainText('d4');
  expect(explorerAuth).toBe('Bearer lichess-token');
});
