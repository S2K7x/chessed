import { describe, expect, it } from 'vitest';
import openings from '../data/openings.json';
import { positionFromFen } from './chess';
import type { Evaluator } from './engine';
import { whiteCp, type PositionEval } from './eval';
import type { OpeningBook } from './openings';
import { parseGame } from './pgn';
import { analyseGame, formatClock } from './review';
import { chessgroundDests } from 'chessops/compat';

/** Evaluates every position as equal, best move = first legal move. */
const flat: Evaluator = {
  id: 'flat',
  async evaluate(fen) {
    const pos = positionFromFen(fen);
    const [from, dests] = [...chessgroundDests(pos)][0]!;
    const e: PositionEval = {
      fen,
      turn: pos.turn,
      lines: [{ rank: 1, score: whiteCp(0), pv: [`${from}${dests[0]}`], depth: 20 }],
      depth: 20,
      source: 'engine',
    };
    return e;
  },
};

describe('clocks', () => {
  it('formats clocks', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(8_400)).toBe('0:08.4');
  });

  it('computes time spent and time trouble', async () => {
    const game = parseGame(`[TimeControl "60+1"]

1. e4 { [%clk 0:01:00] } e5 { [%clk 0:00:59] } 2. Nf3 { [%clk 0:00:51] } Nc6 { [%clk 0:00:05] } *`);
    const review = await analyseGame(game, flat, openings as unknown as OpeningBook, { depth: 20, multiPv: 1 });
    const [m1, m2, m3, m4] = review.moves;
    expect(m1?.timeSpentMs).toBe(1000); // 60 s − 60 s + 1 s increment
    expect(m3?.timeSpentMs).toBe(10_000);
    expect(m2?.timeTrouble).toBe(false);
    expect(m4?.timeTrouble).toBe(true);
    expect(m4?.clockMs).toBe(5000);
  });
});

describe('summary', () => {
  it('writes a few sentences per side', async () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const review = await analyseGame(game, flat, openings as unknown as OpeningBook, { depth: 20, multiPv: 1 });
    expect(review.summary.white.length).toBeGreaterThan(0);
    expect(review.summary.opening).toMatch(/theory/);
  });
});
