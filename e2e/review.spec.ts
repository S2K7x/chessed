import { expect, test, type Page } from '@playwright/test';

const LEGALL = `[White "Legall"]
[Black "Saint Brie"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

/** Clicks a square of the board (White at the bottom). */
async function clickSquare(page: Page, square: string) {
  await expect.poll(async () => (await page.locator('cg-board').boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  const box = (await page.locator('cg-board').boundingBox())!;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const size = box.width / 8;
  await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size);
}

test('imports a PGN, reviews it and practises the blunder', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Game link or PGN').fill(LEGALL);
  await page.getByRole('button', { name: 'Analyse' }).click();

  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `test-results/summary-${info.project.name}.png`, fullPage: true });

  // The deeper second pass runs after the first review; wait for it to finish.
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator('.coach')).toContainText('left known theory');
  await expect(page.locator('.coach-summary-text').last()).toContainText('Theme to work on: king safety');

  // The engine runs multi-threaded when the page is cross-origin isolated.
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // 5. Nxe5 is Legall's famous queen sacrifice.
  const nxe5 = page.locator('.movelist-cell', { hasText: 'Nxe5' });
  await expect(nxe5.locator('.badge')).toHaveAttribute('data-class', 'brilliant');
  await nxe5.click();
  await expect(page.locator('.coach-summary')).toContainText('queen on d1');
  await page.screenshot({ path: `test-results/brilliant-${info.project.name}.png`, fullPage: true });

  // 5...Bxd1 is the blunder that allows mate in two.
  const bxd1 = page.locator('.movelist-cell', { hasText: 'Bxd1' });
  await expect(bxd1.locator('.badge')).toHaveAttribute('data-class', 'blunder');
  await bxd1.click();
  await expect(page.locator('.coach-summary')).toContainText('checkmate in 2');
  await page.screenshot({ path: `test-results/blunder-${info.project.name}.png`, fullPage: true });

  // Replay the line, then retry the move.
  await page.getByRole('button', { name: 'The mating line' }).click();
  await expect(page.getByText('Exploring a line')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Return to the game' }).click();

  await page.getByRole('button', { name: 'Retry this move' }).click();
  await expect(page.getByText('Find a better move')).toBeVisible();
  await clickSquare(page, 'd6');
  await clickSquare(page, 'e5');
  await expect(page.locator('.verdict-good')).toContainText('dxe5 works', { timeout: 30_000 });
  await page.screenshot({ path: `test-results/retry-${info.project.name}.png`, fullPage: true });

  // The game is kept in the library.
  await page.getByRole('button', { name: 'Games' }).click();
  await expect(page.locator('.library-item')).toContainText('Legall');
});
