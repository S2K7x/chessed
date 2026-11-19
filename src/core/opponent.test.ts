import { describe, expect, it } from 'vitest';
import openings from '../data/openings.json';
import { colorOf, opponentMovesAt, opponentReport } from './opponent';
import type { OpeningBook } from './openings';
import { parseGame } from './pgn';

const g = (white: string, black: string, result: string, moves: string) =>
  parseGame(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);

const GAMES = [
  // As White: the Italian three times (2 wins, 1 draw), the London three times (3 losses).
  g('Rival', 'a', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
  g('Rival', 'b', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
  g('Rival', 'c', '1/2-1/2', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'),
  g('Rival', 'd', '0-1', '1. d4 d5 2. Bf4 Nf6 3. e3 e6'),
  g('Rival', 'e', '0-1', '1. d4 d5 2. Bf4 Nf6 3. e3 e6'),
  g('Rival', 'f', '0-1', '1. d4 d5 2. Bf4 Nf6 3. e3 e6'),
  // As Black, once.
  g('h', 'rival', '0-1', '1. e4 c5 2. Nf3 d6 3. d4 cxd4'),
  // Not their game.
  g('x', 'y', '1-0', '1. e4 e5'),
];

describe('opponent preparation', () => {
  it('finds the colour of the opponent, ignoring case', () => {
    expect(colorOf(GAMES[0]!, 'rival')).toBe('white');
    expect(colorOf(GAMES[6]!, 'RIVAL')).toBe('black');
    expect(colorOf(GAMES[7]!, 'rival')).toBeUndefined();
  });

  it('groups their lines, with scores, strong and weak lines', () => {
    const r = opponentReport(GAMES, 'rival', openings as unknown as OpeningBook, 6);
    expect(r.games).toBe(7);
    expect(r.white.games).toBe(6);
    expect(r.black.games).toBe(1);
    expect(r.white.lines).toHaveLength(2);
    const italian = r.white.lines.find((l) => l.moves.startsWith('1. e4'))!;
    expect(italian).toMatchObject({ moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5', games: 3 });
    expect(italian.score).toBeCloseTo(2.5 / 3);
    expect(italian.opening).toMatch(/Italian/);
    expect(r.white.strong.map((l) => l.moves)).toEqual([italian.moves]);
    expect(r.white.weak[0]).toMatchObject({ games: 3, score: 0 });
    expect(r.black.strong).toEqual([]);
  });

  it('lists their moves in a position', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(opponentMovesAt(GAMES, 'rival', start)).toEqual([
      { san: 'e4', count: 3 },
      { san: 'd4', count: 3 },
    ]);
  });
});
