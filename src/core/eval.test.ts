import { describe, expect, it } from 'vitest';
import { formatScore, fromUciScore, povWinPercent, whiteCp, whiteMate, whiteWinPercent, winningChances } from './eval';

describe('score conversion', () => {
  it('keeps White-to-move scores unchanged', () => {
    expect(fromUciScore({ cp: 120 }, 'white')).toEqual({ cp: 120 });
    expect(fromUciScore({ mate: 3 }, 'white')).toEqual({ mate: 3 });
  });
  it('negates Black-to-move scores', () => {
    expect(fromUciScore({ cp: 120 }, 'black')).toEqual({ cp: -120 });
    expect(fromUciScore({ mate: 2 }, 'black')).toEqual({ mate: -2 });
    expect(fromUciScore({ mate: -4 }, 'black')).toEqual({ mate: 4 });
    expect(Object.is(fromUciScore({ cp: 0 }, 'black').cp, 0)).toBe(true);
  });
  it('rejects mate 0, which must be a terminal position', () => {
    expect(() => fromUciScore({ mate: 0 }, 'white')).toThrow();
  });
});

describe('win percentage', () => {
  it('is 50 for an equal position and symmetric', () => {
    expect(whiteWinPercent(whiteCp(0))).toBeCloseTo(50);
    expect(whiteWinPercent(whiteCp(300)) + whiteWinPercent(whiteCp(-300))).toBeCloseTo(100);
  });
  it('matches the Lichess curve', () => {
    // 2 / (1 + exp(-0.00368208 * 100)) - 1
    expect(winningChances(100)).toBeCloseTo(0.18203, 4);
    expect(whiteWinPercent(whiteCp(100))).toBeCloseTo(59.1, 1);
  });
  it('caps centipawns and treats mates as the ceiling', () => {
    expect(whiteWinPercent(whiteCp(5000))).toBeCloseTo(whiteWinPercent(whiteCp(1000)));
    expect(whiteWinPercent(whiteMate(5))).toBeCloseTo(whiteWinPercent(whiteCp(1000)));
    expect(whiteWinPercent(whiteMate(-1))).toBeCloseTo(whiteWinPercent(whiteCp(-1000)));
  });
  it('converts to the point of view of each player', () => {
    const s = whiteCp(250);
    expect(povWinPercent(s, 'white') + povWinPercent(s, 'black')).toBeCloseTo(100);
    expect(povWinPercent(s, 'black')).toBeLessThan(50);
  });
  it('formats scores', () => {
    expect(formatScore(whiteCp(125))).toBe('+1.25');
    expect(formatScore(whiteCp(-40))).toBe('-0.40');
    expect(formatScore(whiteMate(3))).toBe('#3');
    expect(formatScore(whiteMate(-2))).toBe('#-2');
  });
});
