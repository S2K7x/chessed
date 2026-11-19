import { expect, test } from '@playwright/test';

const LEGALL = `[White "Legall"]
[Black "Saint Brie"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

test('explores your own moves from any position of the game', async ({ page }, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Game link or PGN').fill(LEGALL);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });

  // After 5. Nxe5, try the natural 5... dxe5 instead of the game's 5... Bxd1.
  await page.locator('.movelist-cell', { hasText: 'Nxe5' }).click();
  await page.getByLabel('Type a move').fill('dxe5');
  await page.getByLabel('Type a move').press('Enter');
  await expect(page.locator('.explore .coach-kicker')).toHaveText('Exploring');
  await expect(page.locator('.explore-line')).toContainText('5… dxe5');
  await expect(page.locator('.explore-eval strong')).toHaveText(/^([+-]?\d+\.\d\d|#-?\d+)$/, { timeout: 30_000 });
  await expect(page.locator('.explore .coach-detail')).toContainText('Best:');
  await page.screenshot({ path: `test-results/explore-${info.project.name}.png`, fullPage: true });

  // The engine's move extends the line; arrows and Take back move through it.
  await page.getByRole('button', { name: 'Play the best move' }).click();
  await expect(page.locator('.explore-line > span')).toHaveCount(2);
  await page.getByRole('button', { name: 'Take back' }).click();
  await expect(page.locator('.explore-line .is-current')).toContainText('dxe5');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.explore-line .is-current')).not.toContainText('dxe5');

  // Escape returns to the game, at the move where the exploration started.
  await page.keyboard.press('Escape');
  await expect(page.locator('.explore')).toHaveCount(0);
  await expect(page.locator('.movelist-cell.is-active')).toContainText('xe5');
  expect(pageErrors).toEqual([]);
});
