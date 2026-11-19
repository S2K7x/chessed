import { expect, test, type Page } from '@playwright/test';

// Queen against rook, won for White; 1. Qb1?? hangs the queen.
const THROWN = `[White "learner"]
[Black "rival"]
[Date "2026.11.04"]
[Result "0-1"]
[SetUp "1"]
[FEN "1r4k1/8/8/8/8/8/8/3Q2K1 w - - 0 1"]

1. Qb1 Rxb1+ 0-1`;

async function clickSquare(page: Page, square: string) {
  await expect(page.locator('cg-board')).toBeVisible();
  const box = (await page.locator('cg-board').boundingBox())!;
  const size = box.width / 8;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size);
}

test('endgame drills: an endgame you let slip, played again against Stockfish', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByLabel('Game link or PGN').fill(THROWN);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });

  // From the review: the move where the win slipped offers the drill.
  await page.locator('.movelist-cell', { hasText: 'Qb1' }).click();
  await page.getByRole('button', { name: 'Practise converting this endgame' }).click();
  await expect(page.getByRole('heading', { name: 'Win this endgame' })).toBeVisible();
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Open endgames' }).click();
  const drill = page.locator('.drill').first();
  await expect(drill).toContainText('Win it');
  await expect(drill).toContainText('Q vs R');
  await expect(drill).toContainText('New');
  await drill.click();
  await expect(page.getByRole('heading', { name: 'Win this endgame' })).toBeVisible();
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 30_000 });

  // The same mistake again: the queen hangs.
  await clickSquare(page, 'd1');
  await clickSquare(page, 'b1');
  await expect(page.locator('.verdict-bad')).toContainText('After Qb1 the position is no longer winning.', { timeout: 30_000 });
  await expect(page.getByText(/Stockfish answers Rxb1\+\. Your winning chances went from \d+% to \d+%\./)).toBeVisible();
  await page.screenshot({ path: `test-results/endgame-failed-${info.project.name}.png`, fullPage: true });

  // Try again: a check, the engine answers, the hint shows a move.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 30_000 });
  await clickSquare(page, 'd1');
  await clickSquare(page, 'd5');
  await expect(page.locator('.endgame-moves')).toContainText('1. Qd5+');
  // Queen against rook is won: the engine either answers, or already announces a
  // forced mate (multi-threaded search varies), which converts the drill.
  await expect(page.getByText(/^Your move\.|^Converted: a forced mate in \d+ is on the board\./).first()).toBeVisible({ timeout: 30_000 });
  if (await page.getByText('Your move.').isVisible()) {
    await expect(page.locator('.endgame-moves')).toContainText('1. Qd5+ K');
    await page.getByRole('button', { name: 'Hint' }).click();
    await page.screenshot({ path: `test-results/endgame-playing-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Stop' }).click();
    // Back on the list: one failed try recorded (stopped attempts do not count).
    await expect(page.locator('.drill').first()).toContainText('1 try');
  } else {
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page.locator('.drill').first()).toContainText('Converted');
  }
  expect(pageErrors).toEqual([]);
});
