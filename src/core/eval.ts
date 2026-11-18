/**
 * Engine scores and win percentages.
 *
 * Sign convention (the single most important rule of this codebase):
 * UCI engines report scores from the point of view of the side to move.
 * We convert them ONCE, in `fromUciScore`, into a `WhiteScore` (White's point
 * of view). Everything stored or passed around is a `WhiteScore`. Converting
 * to a player's point of view happens only through `povWinPercent`.
 */

export type Color = 'white' | 'black';

export const opposite = (c: Color): Color => (c === 'white' ? 'black' : 'white');

/** Exactly one of `cp` (centipawns) or `mate` (moves to mate, signed) is set. */
export type ScoreValue =
  | { readonly cp: number; readonly mate?: undefined }
  | { readonly mate: number; readonly cp?: undefined };

/** A raw engine score, in the point of view of the side to move. */
export type UciScore = ScoreValue;

declare const whitePov: unique symbol;
/**
 * A score from White's point of view. `mate` is never 0: a position that is
 * already checkmate is represented by `PositionEval.terminal` instead.
 */
export type WhiteScore = ScoreValue & { readonly [whitePov]: true };

export const isMate = (s: ScoreValue): boolean => s.mate !== undefined;

export function fromUciScore(score: UciScore, sideToMove: Color): WhiteScore {
  const sign = sideToMove === 'white' ? 1 : -1;
  if (score.mate !== undefined) {
    if (score.mate === 0) throw new Error('mate 0 must be handled as a terminal position');
    return { mate: sign * score.mate } as WhiteScore;
  }
  // `+ 0` normalises -0 to 0.
  return { cp: sign * score.cp + 0 } as WhiteScore;
}

/** Builds a White-POV score directly (tests, cached data). */
export const whiteCp = (cp: number): WhiteScore => ({ cp }) as WhiteScore;
export const whiteMate = (mate: number): WhiteScore => {
  if (mate === 0) throw new Error('mate 0 is not a score');
  return { mate } as WhiteScore;
};

/** Lichess constant, https://github.com/lichess-org/lila/pull/11148 */
const WIN_MULTIPLIER = -0.00368208;
/** Centipawn values beyond this are treated as decided (Lichess `Eval.Cp.CEILING`). */
export const CP_CEILING = 1000;

/** Winning chances in [-1, 1] for White, from centipawns. */
export function winningChances(cp: number): number {
  const c = Math.max(-CP_CEILING, Math.min(CP_CEILING, cp));
  const wc = 2 / (1 + Math.exp(WIN_MULTIPLIER * c)) - 1;
  return Math.max(-1, Math.min(1, wc));
}

/** Centipawn equivalent used for win percentages: a forced mate counts as the ceiling. */
export function cpEquivalent(s: WhiteScore): number {
  if (s.mate !== undefined) return s.mate > 0 ? CP_CEILING : -CP_CEILING;
  return s.cp;
}

/** White's win percentage in [0, 100] (Lichess formula). */
export function whiteWinPercent(s: WhiteScore): number {
  return 50 + 50 * winningChances(cpEquivalent(s));
}

/** Win percentage of `color`, in [0, 100]. */
export function povWinPercent(s: WhiteScore, color: Color): number {
  const w = whiteWinPercent(s);
  return color === 'white' ? w : 100 - w;
}

/** Score of `color` in pawns-or-mate terms, for display and rules. */
export function povScore(s: WhiteScore, color: Color): UciScore {
  const sign = color === 'white' ? 1 : -1;
  return s.mate !== undefined ? { mate: sign * s.mate } : { cp: sign * s.cp + 0 };
}

/** "+1.25", "-0.40", "#3", "#-2" from White's point of view. */
export function formatScore(s: WhiteScore): string {
  if (s.mate !== undefined) return s.mate > 0 ? `#${s.mate}` : `#-${-s.mate}`;
  const pawns = s.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export type Terminal = 'checkmate' | 'stalemate' | 'insufficient' | 'draw';

export interface EngineLine {
  /** 1-based MultiPV rank. */
  readonly rank: number;
  readonly score: WhiteScore;
  /** UCI moves, starting from the evaluated position. */
  readonly pv: readonly string[];
  readonly depth: number;
  /** Set when the engine reported only a bound for this line. */
  readonly bound?: 'lower' | 'upper';
}

/** Evaluation of one position. */
export interface PositionEval {
  readonly fen: string;
  readonly turn: Color;
  /** Set for positions where the game is over; `lines` is then empty. */
  readonly terminal?: Terminal;
  readonly lines: readonly EngineLine[];
  readonly depth: number;
  readonly source: 'engine' | 'cloud' | 'tablebase' | 'rules';
  readonly engineId?: string;
}

/** White's win percentage of an evaluated position (best line, or the game result). */
export function positionWhiteWinPercent(e: PositionEval): number {
  if (e.terminal === 'checkmate') return e.turn === 'white' ? 0 : 100;
  if (e.terminal) return 50;
  const best = e.lines[0];
  if (!best) throw new Error(`position ${e.fen} has no engine line`);
  return whiteWinPercent(best.score);
}

export const positionPovWinPercent = (e: PositionEval, color: Color): number => {
  const w = positionWhiteWinPercent(e);
  return color === 'white' ? w : 100 - w;
};

/** Best score of a non-terminal position, White POV. */
export function bestScore(e: PositionEval): WhiteScore | undefined {
  return e.lines[0]?.score;
}
