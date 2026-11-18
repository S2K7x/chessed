import { expect, test } from '@playwright/test';

const LEGALL = `[White "Legall"]
[Black "Saint Brie"]
[WhiteElo "1500"]
[BlackElo "1500"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

const COACH = {
  headline: 'Taking the queen walks into mate',
  explanation: 'Bxd1 wins the queen, but it allows a forced mate in 2: 6. Bxf7+ Ke7 7. Nd5#.',
  why_better: 'dxe5 keeps your king safe.',
  lesson: 'When your king has few escape squares, check every enemy check before you move.',
  cited_facts: ['F1'],
};

test('hints, Maia and the verified language-model coach', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  let coachCalls = 0;
  await page.route('https://coach.test/coach', async (route) => {
    coachCalls++;
    const body = route.request().postDataJSON() as { sheet: { move: { san: string } } };
    // Invent a square on the first call: the app must reject it and ask again.
    const text = body.sheet.move.san === 'Bxd1' && coachCalls === 1 ? { ...COACH, why_better: 'Qh4 was better.' } : COACH;
    await route.fulfill({ json: text, headers: { 'Access-Control-Allow-Origin': '*' } });
  });

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Write explanations with Claude').check();
  await page.getByLabel('Coach endpoint').fill('https://coach.test/coach');
  await page.getByLabel('Coach token').fill('t');
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();

  await page.getByLabel('Game link or PGN').fill(LEGALL);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });

  await page.locator('.movelist-cell', { hasText: 'Bxd1' }).click();
  // The first answer mentions Qh4 (not in the facts): rejected, retried, then accepted.
  await expect(page.locator('.llm-headline')).toHaveText(COACH.headline, { timeout: 20_000 });
  expect(coachCalls).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.llm')).not.toContainText('Qh4');

  // What players at this level play (Maia-3 in the browser).
  await page.getByRole('button', { name: 'What do players at this level play here?' }).click();
  await expect(page.locator('.human-list li').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `test-results/coach-${info.project.name}.png`, fullPage: true });

  // Graded hints, then solve and play on against Maia.
  await page.getByRole('button', { name: 'Retry this move' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.hint-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.hint-line')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Hint' })).toHaveCount(0);

  const box = (await page.locator('cg-board').boundingBox())!;
  // The retry is shown from Black's side (the side that blundered).
  const click = async (sq: string) => {
    const f = 7 - (sq.charCodeAt(0) - 97);
    const r = 7 - (Number(sq[1]) - 1);
    await page.mouse.click(box.x + (f + 0.5) * (box.width / 8), box.y + (7 - r + 0.5) * (box.width / 8));
  };
  await click('d6');
  await click('e5');
  await expect(page.locator('.verdict-good')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Play on against Maia' }).click();
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `test-results/playout-${info.project.name}.png`, fullPage: true });
  expect(pageErrors).toEqual([]);
});
