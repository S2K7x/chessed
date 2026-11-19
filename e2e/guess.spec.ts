import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeSquare } from 'chessops/util';

const games = JSON.parse(readFileSync(new URL('../src/data/masterGames.json', import.meta.url), 'utf8')) as { id: string; pgn: string }[];

/** The first move the winner must guess (after move 8), as from/to squares. */
function firstGuess(pgn: string): { side: 'white' | 'black'; from: string; to: string } {
  const g = parsePgn(pgn)[0]!;
  const side = g.headers.get('Result') === '0-1' ? 'black' : 'white';
  const pos = startingPosition(g.headers).unwrap();
  let ply = 0;
  for (const node of g.moves.mainline()) {
    ply++;
    const move = parseSan(pos, node.san)!;
    if (pos.turn === side && Math.ceil(ply / 2) > 8 && 'from' in move) return { side, from: makeSquare(move.from), to: makeSquare(move.to) };
    pos.play(move);
  }
  throw new Error('no move to guess');
}

/** A legal move of the position other than `avoid` (from+to). */
function otherMove(fen: string, avoid: string): [string, string] {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  for (const [from, dests] of pos.allDests()) for (const to of dests) if (makeSquare(from) + makeSquare(to) !== avoid) return [makeSquare(from), makeSquare(to)];
  throw new Error('no other move');
}

async function clickSquare(page: Page, square: string) {
  const bottom = await page.locator('.board').getAttribute('data-orientation');
  const box = (await page.locator('cg-board').boundingBox())!;
  const size = box.width / 8;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const x = bottom === 'white' ? file : 7 - file;
  const y = bottom === 'white' ? 7 - rank : rank;
  await page.mouse.click(box.x + (x + 0.5) * size, box.y + (y + 0.5) * size);
}

test('guess the move through a master game', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const first = firstGuess(games[0]!.pgn);

  await page.goto('/');
  await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
  await page.getByRole('button', { name: 'Guess the move' }).click();
  await expect(page.getByRole('heading', { name: 'Guess the move' })).toBeVisible();
  await expect(page.locator('.guess-list li')).toHaveCount(games.length);
  await page.locator('.guess-list li').first().getByRole('button', { name: first.side === 'white' ? /\(White\)/ : /\(Black\)/ }).click();

  // The master's move scores 3.
  await expect(page.getByRole('heading', { name: /^What did .+ play\?$/ })).toBeVisible();
  await clickSquare(page, first.from);
  await clickSquare(page, first.to);
  await expect(page.locator('.guess-verdict')).toHaveText("The master's move. +3");
  await expect(page.getByLabel('Score')).toContainText('3');
  await page.screenshot({ path: `test-results/guess-${info.project.name}.png`, fullPage: true });

  // Another move is judged by the engine.
  await page.getByRole('button', { name: 'Next move' }).click();
  const fen = (await page.locator('.board').getAttribute('data-fen'))!;
  const [from, to] = otherMove(fen, '');
  await clickSquare(page, from);
  await clickSquare(page, to);
  await expect(page.locator('.guess-verdict')).toHaveText(/^(The master's move\. \+3|Not the master's move, but just as good\. \+2|Close: a reasonable move, a little weaker\. \+1|Not this time\.)\s*$/, { timeout: 30_000 });
  await expect(page.locator('.guess-trail li.is-master')).toHaveCount(1, { timeout: 1000 }).catch(async () => {
    // The first legal move may happen to be the master's move too.
    await expect(page.locator('.guess-trail li.is-master')).toHaveCount(2);
  });

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.guess-list')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
