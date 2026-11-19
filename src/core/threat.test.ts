import { describe, expect, it } from 'vitest';
import type { Evaluator } from './engine';
import type { UciScore } from './eval';
import { evalOf, START } from './testing/fixtures';
import { describeThreat, findThreat, nullMoveFen } from './threat';

/** Answers the null-move position with a fixed line (side-to-move score). */
const fixed = (score: UciScore, pv: string[]): Evaluator => ({
  id: 'fixed',
  evaluate: async (fen) => evalOf(fen, [{ score, pv }]),
});

describe('null move', () => {
  it('passes the move to the other side', () => {
    expect(nullMoveFen(START)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
    // Black passes: the move number goes up and the en passant square is cleared.
    expect(nullMoveFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
  });

  it('is not defined in check', () => {
    expect(nullMoveFen('4k3/8/8/8/8/8/8/r3K3 w - - 0 1')).toBeUndefined();
  });
});

describe('findThreat', () => {
  it('finds a hanging piece', async () => {
    const fen = '3qk3/8/8/8/3R4/8/8/7K w - - 0 1';
    const t = await findThreat(fen, fixed({ cp: 600 }, ['d8d4']), 12);
    expect(t).toMatchObject({ kind: 'material', amount: 5, target: { role: 'rook', square: 'd4' } });
    expect(t && t.kind === 'material' && t.line[0]?.san).toBe('Qxd4');
    expect(describeThreat(t!)).toBe('Your opponent threatens Qxd4, winning your rook on d4.');
  });

  it('finds a mate threat', async () => {
    const fen = 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1';
    const t = await findThreat(fen, fixed({ mate: 1 }, ['a8a1']), 12);
    expect(t).toMatchObject({ kind: 'mate', mateIn: 1 });
    expect(describeThreat(t!)).toBe('Your opponent threatens mate in 1: Ra1#.');
  });

  it('reports a quiet move as no threat', async () => {
    const t = await findThreat(START, fixed({ cp: 30 }, ['e7e5']), 12);
    expect(t).toMatchObject({ kind: 'none', move: { san: 'e5' } });
    expect(describeThreat(t!)).toMatch(/^No direct threat/);
  });

  it('is undefined in check', async () => {
    expect(await findThreat('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', fixed({ cp: 0 }, []), 12)).toBeUndefined();
  });
});
