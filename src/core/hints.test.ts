import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import openings from '../data/openings.json';
import { hintsFor } from './hints';
import type { OpeningBook } from './openings';
import { parseGame } from './pgn';
import { judgeAttempt } from './retry';
import { analyseGame, type GameReview } from './review';
import { createNodeEngine } from './testing/nodeEngine';
import { LEGALL_PGN } from './testing/fixtures';

const engine = createNodeEngine();
let review: GameReview;
beforeAll(async () => {
  review = await analyseGame(parseGame(LEGALL_PGN), engine, openings as unknown as OpeningBook, { depth: 12, multiPv: 2 });
}, 120_000);
afterAll(() => engine.dispose());

describe('hints and attempts', () => {
  it('gives three graded hints ending with the best move', () => {
    const bxd1 = review.moves.find((m) => m.san === 'Bxd1')!;
    const hints = hintsFor(bxd1);
    expect(hints).toHaveLength(3);
    expect(hints[1]!.circle).toBe(bxd1.bestLine[0]!.uci.slice(0, 2));
    expect(hints[2]!.arrow?.to).toBe(bxd1.bestLine[0]!.uci.slice(2, 4));
  });

  it('explains why a wrong attempt fails', async () => {
    const i = review.moves.findIndex((m) => m.san === 'Bxd1');
    const game = parseGame(LEGALL_PGN);
    const v = await judgeAttempt(game.moves[i]!.fenBefore, 'g4d1', review.evals[i]!, engine, 12);
    expect(v.result).toBe('wrong');
    expect(v.explanation?.summary).toContain('checkmate in 2');
    const ok = await judgeAttempt(game.moves[i]!.fenBefore, review.moves[i]!.bestLine[0]!.uci, review.evals[i]!, engine, 12);
    expect(ok.result).toBe('solved');
    expect(ok.explanation).toBeUndefined();
  });
});
