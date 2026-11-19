import { describe, expect, it } from 'vitest';
import masterGames from '../data/masterGames.json';
import { defaultGuessSide, guessIndices, guessScore, guessVerdict, shortPlayerName, type GuessResult } from './guess';
import { parseGame } from './pgn';

describe('guess the move', () => {
  it('bundles legal, decisive master games', () => {
    expect(masterGames.length).toBeGreaterThanOrEqual(12);
    for (const g of masterGames) {
      const game = parseGame(g.pgn);
      expect(game.moves.length).toBeGreaterThanOrEqual(40);
      expect(['1-0', '0-1']).toContain(game.result);
    }
  });

  it('skips the opening and keeps one side', () => {
    const game = parseGame(masterGames[0]!.pgn);
    const side = defaultGuessSide(game);
    const idx = guessIndices(game, side);
    expect(idx.length).toBeGreaterThan(5);
    for (const i of idx) {
      const m = game.moves[i]!;
      expect(m.ply % 2 === 1 ? 'white' : 'black').toBe(side);
      expect(Math.ceil(m.ply / 2)).toBeGreaterThan(8);
    }
    // A short game is guessed from the first move.
    const short = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 *');
    expect(guessIndices(short, 'white')).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('scores guesses', () => {
    expect(guessVerdict('e2e4', 'e2e4')).toBe('master');
    expect(guessVerdict('d2d4', 'e2e4', 'solved')).toBe('as-good');
    expect(guessVerdict('d2d4', 'e2e4', 'close')).toBe('close');
    expect(guessVerdict('d2d4', 'e2e4', 'wrong')).toBe('miss');
    const r = (verdict: GuessResult['verdict'], points: number): GuessResult => ({ index: 0, guessSan: '', masterSan: '', verdict, points });
    expect(guessScore([r('master', 3), r('as-good', 2), r('miss', 0)])).toEqual({ points: 5, max: 9, matched: 1, guessed: 3, percent: (100 * 5) / 9 });
    expect(guessScore([]).percent).toBe(0);
  });

  it('shortens database names', () => {
    expect(shortPlayerName('Carlsen, M.')).toBe('Carlsen');
    expect(shortPlayerName('Ding Liren')).toBe('Ding Liren');
  });
});
