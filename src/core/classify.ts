import {
  positionPovWinPercent,
  povScore,
  povWinPercent,
  type Color,
  type PositionEval,
} from './eval';

/**
 * Move classification, version 1. Every rule is documented in
 * docs/CLASSIFICATION.md; bump CLASSIFIER_VERSION when a rule changes so that
 * stored reviews can be re-interpreted.
 */
export const CLASSIFIER_VERSION = 'v1.0';

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Upper bounds of win-percentage loss for each class (mover's point of view). */
export const THRESHOLDS = {
  best: 0.5,
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
} as const;

/** A move is "book" only if it is in the opening book and loses at most this much. */
export const BOOK_MAX_LOSS = 5;
/** "Great": every alternative loses at least this much more than the played best move. */
export const ONLY_MOVE_GAP = 10;
/** No "Great" once the position was already this winning. */
export const GREAT_MAX_WIN = 90;
/** Win percentages beyond these bounds are "decided": losses are capped at inaccuracy. */
export const DECIDED_HIGH = 97;
export const DECIDED_LOW = 3;
/** Losing a forced mate while still above this centipawn score is at worst an inaccuracy. */
export const STILL_WINNING_CP = 700;
/** "Miss": failing to punish an opponent's mistake. */
export const MISS_WIN_BEFORE = 80;
export const MISS_WIN_AFTER = 65;

export type Reason =
  | 'single_legal_move'
  | 'opening_book'
  | 'engine_top_move'
  | 'within_best_margin'
  | 'only_good_move'
  | 'still_mating'
  | 'lost_forced_mate_still_winning'
  | 'already_decided'
  | 'missed_punishment'
  | 'allowed_mate'
  | 'missed_mate'
  | 'low_engine_confidence';

export interface MoveContext {
  uci: string;
  color: Color;
  /** Evaluation of the position before the move (MultiPV ≥ 2 recommended). */
  before: PositionEval;
  /** Evaluation of the position after the move. */
  after: PositionEval;
  legalMoves: number;
  inBook: boolean;
  /** Classification of the opponent's previous move, if any. */
  previousOpponentClass?: Classification;
  /** True when this move recaptures on the square where the opponent just captured. */
  isRecapture?: boolean;
}

export interface Assessment {
  classification: Classification;
  /** Mover's win % with best play, before the move. */
  winBefore: number;
  /** Mover's win % after the played move. */
  winAfter: number;
  /** max(0, winBefore − winAfter). */
  winLoss: number;
  bestUci?: string;
  /** Win % loss of the engine's second choice, when known. */
  secondBestLoss?: number;
  reasons: Reason[];
  confidence: 'high' | 'low';
}

const ORDER: Classification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

function byLoss(loss: number): Classification {
  if (loss <= THRESHOLDS.best) return 'best';
  if (loss <= THRESHOLDS.excellent) return 'excellent';
  if (loss <= THRESHOLDS.good) return 'good';
  if (loss <= THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss <= THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

const atMost = (c: Classification, cap: Classification): Classification =>
  ORDER.indexOf(c) > ORDER.indexOf(cap) ? cap : c;

const moverMates = (e: PositionEval, color: Color): number | undefined => {
  if (e.terminal === 'checkmate') return e.turn === color ? undefined : 0;
  const s = e.lines[0]?.score;
  if (!s) return undefined;
  const m = povScore(s, color).mate;
  return m !== undefined && m > 0 ? m : undefined;
};

const opponentMates = (e: PositionEval, color: Color): boolean => {
  if (e.terminal === 'checkmate') return e.turn === color;
  const s = e.lines[0]?.score;
  if (!s) return false;
  const m = povScore(s, color).mate;
  return m !== undefined && m < 0;
};

export function classifyMove(ctx: MoveContext): Assessment {
  const { before, after, color, uci } = ctx;
  const best = before.lines[0];
  const winBefore = positionPovWinPercent(before, color);
  const played = before.lines.find((l) => l.pv[0] === uci);
  const isTopMove = best?.pv[0] === uci;

  let winAfter: number;
  if (after.terminal || !played) winAfter = positionPovWinPercent(after, color);
  else if (isTopMove) winAfter = winBefore;
  // The played move is one of the MultiPV lines: same search, comparable score.
  else winAfter = povWinPercent(played.score, color);
  const winLoss = Math.max(0, winBefore - winAfter);

  const reasons: Reason[] = [];
  const lowConfidence = !best || best.bound !== undefined || before.depth < 10;
  const result = (classification: Classification): Assessment => {
    const a: Assessment = {
      classification,
      winBefore,
      winAfter,
      winLoss,
      reasons,
      confidence: lowConfidence ? 'low' : 'high',
    };
    if (best) a.bestUci = best.pv[0];
    const second = before.lines[1];
    if (second && second.depth >= (best?.depth ?? 0) - 1) {
      a.secondBestLoss = Math.max(0, winBefore - povWinPercent(second.score, color));
    }
    if (lowConfidence) reasons.push('low_engine_confidence');
    return a;
  };

  if (ctx.legalMoves === 1) {
    reasons.push('single_legal_move');
    return result('forced');
  }
  if (ctx.inBook && winLoss <= BOOK_MAX_LOSS) {
    reasons.push('opening_book');
    return result('book');
  }

  const hadMate = moverMates(before, color);
  const hasMate = moverMates(after, color);
  if (hadMate !== undefined && hasMate !== undefined) {
    reasons.push('still_mating');
    if (isTopMove || after.terminal === 'checkmate') reasons.push('engine_top_move');
    return result(isTopMove || after.terminal === 'checkmate' ? 'best' : 'excellent');
  }

  let c: Classification;
  if (isTopMove) {
    reasons.push('engine_top_move');
    c = 'best';
  } else {
    c = byLoss(winLoss);
    if (c === 'best') reasons.push('within_best_margin');
  }

  if (hadMate !== undefined && hasMate === undefined) {
    reasons.push('missed_mate');
    const s = after.lines[0]?.score;
    const cp = s ? povScore(s, color).cp : undefined;
    if (cp !== undefined && cp > STILL_WINNING_CP) {
      reasons.push('lost_forced_mate_still_winning');
      c = atMost(c, 'inaccuracy');
    }
  }
  if (!opponentMates(before, color) && opponentMates(after, color)) reasons.push('allowed_mate');

  const decided =
    (winBefore >= DECIDED_HIGH && winAfter >= DECIDED_HIGH) || (winBefore <= DECIDED_LOW && winAfter <= DECIDED_LOW);
  if (decided && ORDER.indexOf(c) > ORDER.indexOf('inaccuracy')) {
    reasons.push('already_decided');
    c = 'inaccuracy';
  }

  const punishable = ctx.previousOpponentClass === 'mistake' || ctx.previousOpponentClass === 'blunder';
  if (
    punishable &&
    winBefore >= MISS_WIN_BEFORE &&
    winAfter < MISS_WIN_AFTER &&
    winLoss >= THRESHOLDS.good &&
    c !== 'blunder'
  ) {
    reasons.push('missed_punishment');
    c = 'miss';
  }

  const a = result(c);
  if (
    c === 'best' &&
    isTopMove &&
    !lowConfidence &&
    !ctx.isRecapture &&
    winBefore < GREAT_MAX_WIN &&
    a.secondBestLoss !== undefined &&
    a.secondBestLoss >= ONLY_MOVE_GAP &&
    before.lines[1]?.bound === undefined
  ) {
    reasons.push('only_good_move');
    a.classification = 'great';
  }
  return a;
}

/** Classes that count as an error of the mover. */
export const ERROR_CLASSES: ReadonlySet<Classification> = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);
/** Classes that make a "key moment" worth stopping at. */
export const KEY_CLASSES: ReadonlySet<Classification> = new Set(['mistake', 'miss', 'blunder', 'great', 'brilliant']);
