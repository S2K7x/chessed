import type { Color } from './eval';

/**
 * Accuracy, ported from Lichess (lila, modules/analyse/src/main/AccuracyPercent.scala,
 * AGPL-3.0; formula re-implemented here, not copied).
 */

/** Accuracy of one move, from the mover's win % before and after it. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const winDiff = winBefore - winAfter;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) - 3.166924740191411;
  // +1: uncertainty bonus for imperfect analysis (as Lichess).
  return Math.max(0, Math.min(100, raw + 1));
}

function standardDeviation(xs: readonly number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface GameAccuracy {
  white?: number;
  black?: number;
}

/**
 * Game accuracy per color: the mean of a volatility-weighted mean and a
 * harmonic mean of move accuracies (Lichess).
 *
 * @param whiteWins White's win % for every position, start included (N moves → N+1 values).
 * @param startColor color to move in the first position.
 * @param include predicate on the move index (0-based); excluded moves (book,
 *   forced) are left out of both means.
 */
export function gameAccuracy(
  whiteWins: readonly number[],
  startColor: Color,
  include: (moveIndex: number) => boolean = () => true,
): GameAccuracy {
  if (whiteWins.length < 2) return {};
  const windowSize = clamp(Math.floor((whiteWins.length - 1) / 10), 2, 8);
  const windows: number[][] = [];
  const padding = Math.min(windowSize, whiteWins.length) - 2;
  for (let i = 0; i < padding; i++) windows.push(whiteWins.slice(0, windowSize));
  if (whiteWins.length <= windowSize) windows.push([...whiteWins]);
  else for (let i = 0; i + windowSize <= whiteWins.length; i++) windows.push(whiteWins.slice(i, i + windowSize));
  const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12));

  const per: Record<Color, { acc: number; weight: number }[]> = { white: [], black: [] };
  for (let i = 0; i + 1 < whiteWins.length; i++) {
    if (!include(i)) continue;
    const prev = whiteWins[i]!;
    const next = whiteWins[i + 1]!;
    const color: Color = (i % 2 === 0) === (startColor === 'white') ? 'white' : 'black';
    const acc = color === 'white' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    per[color].push({ acc, weight: weights[i] ?? weights[weights.length - 1] ?? 1 });
  }

  const combine = (xs: { acc: number; weight: number }[]): number | undefined => {
    if (xs.length === 0) return undefined;
    const totalWeight = xs.reduce((a, x) => a + x.weight, 0);
    const weighted = xs.reduce((a, x) => a + x.acc * x.weight, 0) / totalWeight;
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(1, x.acc), 0);
    return (weighted + harmonic) / 2;
  };
  const out: GameAccuracy = {};
  const w = combine(per.white);
  const b = combine(per.black);
  if (w !== undefined) out.white = w;
  if (b !== undefined) out.black = b;
  return out;
}
