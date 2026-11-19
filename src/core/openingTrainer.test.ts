import { describe, expect, it } from 'vitest';
import { epdOf } from './chess';
import type { Classification } from './classify';
import { againstOpponent, buildOpeningTree, expectedAt, pickReply, seededRandom, trainerCoverage, type OpeningStat } from './openingTrainer';
import { parseGame } from './pgn';
import type { GameReview } from './review';
import { replayUci } from './chess';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A review where the given plies (1-based) are mistakes with `best` as the better move. */
function reviewOf(pgn: string, mistakes: Record<number, string> = {}) {
  const game = parseGame(pgn);
  const moves = game.moves.map((m) => ({
    ply: m.ply,
    san: m.san,
    assessment: { classification: (mistakes[m.ply] ? 'mistake' : 'best') as Classification },
    bestLine: mistakes[m.ply] ? replayUci(m.fenBefore, [mistakes[m.ply]!]) : [],
  }));
  return { game, review: { moves } as unknown as GameReview, color: 'white' as const };
}

describe('opening trainer', () => {
  const games = [
    reviewOf('1. e4 e5 2. Nf3 Nc6 3. Bc4 *'),
    reviewOf('1. e4 c5 2. Nf3 d6 3. d4 *'),
    reviewOf('1. e4 e5 2. Nf3 Nc6 3. Bc4 *'),
    // Twice 2. Qh5 after 1... e6: an error each time, d4 was better.
    reviewOf('1. e4 e6 2. Qh5 d5 *', { 3: 'd2d4' }),
    reviewOf('1. e4 e6 2. Qh5 g6 *', { 3: 'd2d4' }),
    reviewOf('1. e4 e6 2. d4 d5 *'),
  ];
  const tree = buildOpeningTree(games, 'white');

  it('builds the tree of positions with both sides moves', () => {
    const start = tree.get(epdOf(START))!;
    expect([...start.mine.values()]).toEqual([{ san: 'e4', uci: 'e2e4', count: 6, errors: 0 }]);
    const afterE4 = [...tree.values()].find((n) => n.theirs.size > 0 && n.fen.includes(' b '))!;
    expect(new Map([...afterE4.theirs.values()].map((m) => [m.san, m.count]))).toEqual(new Map([['e5', 2], ['c5', 1], ['e6', 3]]));
  });

  it('expects the usual move, or the best one when the usual move is an error', () => {
    expect(expectedAt(tree.get(epdOf(START)))?.main.san).toBe('e4');
    const french = tree.get(epdOf(replayUci(START, ['e2e4', 'e7e6'])[1]!.fenAfter))!;
    const ex = expectedAt(french)!;
    expect(ex).toMatchObject({ main: { san: 'd4' }, usualError: 'Qh5' });
    expect(ex.accepted.has('d2d4')).toBe(true);
    expect(ex.accepted.has('d1h5')).toBe(false);
  });

  it('picks replies by frequency and towards weak positions', () => {
    const afterE4 = tree.get(epdOf(replayUci(START, ['e2e4'])[0]!.fenAfter))!;
    const count = (stats: Map<string, OpeningStat>) => {
      const rnd = seededRandom(1);
      const seen: Record<string, number> = {};
      for (let i = 0; i < 600; i++) {
        const m = pickReply(tree, afterE4, 'white', stats, rnd)!;
        seen[m.san] = (seen[m.san] ?? 0) + 1;
      }
      return seen;
    };
    const plain = count(new Map());
    expect(plain.e6!).toBeGreaterThan(plain.c5!);
    // The French position, always got wrong, comes up much more often.
    const frenchEpd = epdOf(replayUci(START, ['e2e4', 'e7e6'])[1]!.fenAfter);
    const sicilianEpd = epdOf(replayUci(START, ['e2e4', 'c7c5'])[1]!.fenAfter);
    const stats = new Map<string, OpeningStat>([
      [`white|${frenchEpd}`, { id: '', right: 0, wrong: 3, lastAt: 0 }],
      [`white|${sicilianEpd}`, { id: '', right: 5, wrong: 0, lastAt: 0 }],
    ]);
    const weighted = count(stats);
    expect(weighted.e6! / 600).toBeGreaterThan(plain.e6! / 600);
    expect(weighted.c5!).toBeLessThan(plain.c5!);
  });

  it('measures what is known', () => {
    const cov = trainerCoverage(tree, 'white', new Map([[`white|${epdOf(START)}`, { id: '', right: 2, wrong: 0, lastAt: 0 }]]));
    expect(cov.positions).toBeGreaterThan(3);
    expect(cov.known).toBe(1);
  });
});

describe('training against one opponent', () => {
  it('replies with the moves the opponent played, and stops where they never went', () => {
    // My games as Black.
    const mine = buildOpeningTree(
      [
        { game: parseGame('1. e4 e5 2. Nf3 Nc6 *'), color: 'black' as const },
        { game: parseGame('1. d4 d5 2. c4 e6 *'), color: 'black' as const },
      ],
      'black',
    );
    // The opponent, as White, always plays 1. d4 2. Bf4.
    const theirs = buildOpeningTree(
      [
        { game: parseGame('1. d4 d5 2. Bf4 Nf6 *'), color: 'white' as const },
        { game: parseGame('1. d4 d5 2. Bf4 c5 *'), color: 'white' as const },
      ],
      'white',
    );
    const tree = againstOpponent(mine, theirs);
    const start = tree.get(epdOf(START))!;
    expect([...start.theirs.values()].map((m) => m.san)).toEqual(['d4']);
    // After 1. d4 d5, the reply is their 2. Bf4, a position I have never had.
    const afterD5 = tree.get(epdOf(replayUci(START, ['d2d4', 'd7d5'])[1]!.fenAfter))!;
    expect([...afterD5.theirs.values()].map((m) => m.san)).toEqual(['Bf4']);
    const afterBf4 = tree.get(epdOf(replayUci(START, ['d2d4', 'd7d5', 'c1f4'])[2]!.fenAfter));
    expect(expectedAt(afterBf4)).toBeUndefined();
  });
});
