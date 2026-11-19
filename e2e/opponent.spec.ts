import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const lichessPgn = (id: string, white: string, black: string, result: string, moves: string) => `[Event "Rated blitz game"]
[Site "https://lichess.org/${id}"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]

${moves} ${result}
`;

// "rival" always opens 1. e4 with White (the Two Knights with 4. Ng5) and loses the Queen's Gambit with Black.
const RIVAL = [
  lichessPgn('r0000001', 'rival', 'a', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5'),
  lichessPgn('r0000002', 'rival', 'b', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5'),
  lichessPgn('r0000003', 'rival', 'c', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5'),
  lichessPgn('r0000004', 'rival', 'd', '0-1', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5'),
  lichessPgn('r0000005', 'e', 'rival', '1-0', '1. d4 d5 2. c4 e6 3. Nc3 Nf6'),
  lichessPgn('r0000006', 'f', 'rival', '1-0', '1. d4 d5 2. c4 e6 3. Nc3 Nf6'),
  lichessPgn('r0000007', 'g', 'rival', '1-0', '1. d4 d5 2. c4 e6 3. Nc3 Nf6'),
].join('\n');

test('prepares for an opponent and trains against their moves', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('https://lichess.org/api/games/user/rival**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: RIVAL }),
  );

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Lichess username').fill('learner');
  // My own game as Black: 4. d3, never 4. Ng5.
  await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
  await page.getByLabel('Game link or PGN').fill('[White "x"]\n[Black "learner"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7 0-1');
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });

  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Prepare for an opponent' }).click();
  await page.getByLabel("Opponent's username").fill('rival');
  await page.getByRole('button', { name: 'Scout' }).click();
  await expect(page.locator('.opponent-summary')).toContainText('rival · 7 games');
  const white = page.locator('.opponent-side').first();
  await expect(white).toContainText('4 games · they score 75%');
  await expect(white).toContainText('Their best lines: avoid them');
  await expect(white.locator('.opponent-lines').first()).toContainText(/Italian|Two Knights/);
  await expect(page.locator('.opponent-side').nth(1)).toContainText('Their weakest lines: aim for them');
  await page.screenshot({ path: `test-results/opponent-${info.project.name}.png`, fullPage: true });
  // No serious accessibility violation on the report (WCAG 2.1 AA).
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
  });
  expect(violations).toEqual([]);

  // Training as Black: they play their moves, I play mine, until their 4. Ng5.
  await page.getByRole('button', { name: 'Train your openings as black against their moves' }).click();
  await expect(page.locator('.coach-kicker')).toHaveText('Against rival');
  for (const move of ['e5', 'Nc6', 'Nf6']) {
    await page.getByLabel('Type a move').fill(move);
    await page.getByLabel('Type a move').press('Enter');
  }
  await expect(page.getByText('You have never had this position in your games: this is where to prepare a move against rival.')).toBeVisible();
  await expect(page.locator('.opening-line')).toContainText('4. ');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Prepare for an opponent' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
