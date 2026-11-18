import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from './accuracy';

describe('accuracy', () => {
  it('gives 100 for a move that does not lose', () => {
    expect(moveAccuracy(55, 55)).toBe(100);
    expect(moveAccuracy(40, 60)).toBe(100);
  });
  it('decreases with the win-% loss (Lichess curve)', () => {
    // 103.1668 × e^(−0.043544 × 10) − 3.1669 + 1
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.58, 1);
    expect(moveAccuracy(80, 40)).toBeLessThan(20);
    expect(moveAccuracy(90, 0)).toBe(0);
  });
  it('computes ~100 for a game without losses', () => {
    const wins = [50, 52, 52, 53, 53, 54, 54, 55, 55, 56, 56];
    const a = gameAccuracy(wins, 'white');
    expect(a.white).toBeGreaterThan(99);
    expect(a.black).toBeGreaterThan(90);
  });
  it('penalises the side that blunders, not the other', () => {
    // Move index 6 (White's 4th move) drops White from 50% to 15%.
    const wins = [50, 50, 50, 50, 50, 50, 50, 15, 15, 15, 15];
    const a = gameAccuracy(wins, 'white');
    expect(a.white).toBeLessThan(a.black!);
  });
  it('skips excluded moves', () => {
    const wins = [50, 20, 20, 20, 20];
    expect(gameAccuracy(wins, 'white', (i) => i !== 0).white).toBeCloseTo(100, 0);
  });
  it('handles Black starting from a position', () => {
    const a = gameAccuracy([50, 80, 80], 'black');
    expect(a.black).toBeLessThan(40);
    expect(a.white).toBeGreaterThan(95);
  });
});
