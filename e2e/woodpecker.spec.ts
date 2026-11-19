import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';

const GAMES = [
  `[White "Legall"]
[Black "learner"]
[Date "2026.11.01"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`,
  `[White "rival"]
[Black "learner"]
[Date "2026.11.02"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`,
  `[White "other"]
[Black "learner"]
[Date "2026.11.03"]
[Result "1-0"]

1. e4 e5 2. Qh5 Ke7 3. Qxe5# 1-0`,
];

async function analyse(page: Page, pgn: string) {
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByLabel('Game link or PGN').fill(pgn);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
}

/** A mating move if there is one, else the first legal move. */
function pickMove(fen: string): [string, string] {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  let first: [string, string] | undefined;
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      first ??= [makeSquare(from), makeSquare(to)];
      const next = pos.clone();
      next.play({ from, to });
      if (next.isCheckmate()) return [makeSquare(from), makeSquare(to)];
    }
  }
  return first!;
}

async function clickSquare(page: Page, square: string, bottom: string) {
  const box = (await page.locator('cg-board').boundingBox())!;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const x = bottom === 'white' ? file : 7 - file;
  const y = bottom === 'white' ? 7 - rank : rank;
  const size = box.width / 8;
  await page.mouse.click(box.x + (x + 0.5) * size, box.y + (y + 0.5) * size);
}

test('Woodpecker: build a set from your positions and run a cycle', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  for (const pgn of GAMES) await analyse(page, pgn);

  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Open Woodpecker' }).click();
  await expect(page.getByRole('heading', { name: 'Woodpecker' })).toBeVisible();
  await page.getByRole('button', { name: /^All \d+ positions$/ }).click();
  await page.getByRole('button', { name: 'Start cycle 1' }).click();

  const total = Number((await page.getByText(/position 1 of \d+/).innerText()).match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThanOrEqual(5);
  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`position ${i} of ${total}`)).toBeVisible({ timeout: 15_000 });
    if (i === 2) {
      // Pausing keeps the cycle; it resumes on the same position.
      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('button', { name: `Continue cycle 1 (2 of ${total})` }).click();
      await expect(page.getByText(`position 2 of ${total}`)).toBeVisible();
    }
    const board = page.locator('.board');
    const fen = (await board.getAttribute('data-fen'))!;
    const bottom = (await board.getAttribute('data-orientation'))!;
    const [from, to] = pickMove(fen);
    await clickSquare(page, from, bottom);
    await clickSquare(page, to, bottom);
    await expect(page.locator('.verdict-good, .verdict-bad')).toBeVisible({ timeout: 30_000 });
    if (i === 1) await page.screenshot({ path: `test-results/woodpecker-${info.project.name}.png`, fullPage: true });
    if (await page.locator('.verdict-bad').isVisible()) {
      await page.getByRole('button', { name: i === total ? 'Finish the cycle' : 'Next position' }).click();
    }
  }

  // Back on the overview: cycle 1 is recorded and cycle 2 can start.
  await expect(page.getByRole('button', { name: 'Start cycle 2' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Cycle 1 done.')).toBeVisible();
  const row = page.locator('.woodpecker .table tbody tr').first();
  // At least the two mate-in-one blunder checks are solved.
  const solved = Number((await row.locator('td').nth(1).innerText()).split('/')[0]);
  expect(solved).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: `test-results/woodpecker-overview-${info.project.name}.png`, fullPage: true });

  // The set survives a reload (IndexedDB).
  await page.reload();
  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Open Woodpecker' }).click();
  await expect(page.getByRole('button', { name: 'Start cycle 2' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
