import { gameAccuracy, type GameAccuracy } from './accuracy';
import { legalMoveCount, moveNumberLabel, positionFromFen, replayUci, terminalOf, turnOf, type SanMove } from './chess';
import { classifyMove, CLASSIFIER_VERSION, ERROR_CLASSES, KEY_CLASSES, type Assessment, type Classification } from './classify';
import type { Evaluator } from './engine';
import { positionWhiteWinPercent, type Color, type PositionEval } from './eval';
import { explainMove, type Explanation } from './explain';
import { detectFacts, type Fact } from './facts';
import type { Game } from './game';
import { isBookPosition, openingAt, type OpeningBook } from './openings';
import { phasesOf, type Phase } from './phase';

export interface AnalysisSettings {
  depth: number;
  multiPv: number;
}

export const DEFAULT_SETTINGS: AnalysisSettings = { depth: 14, multiPv: 2 };

export interface MoveReview {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  label: string;
  phase: Phase;
  assessment: Assessment;
  /** Engine's best line from the position before the move (legal, SAN). */
  bestLine: SanMove[];
  facts: Fact[];
  explanation: Explanation;
  isKeyMoment: boolean;
  /** "tactical" when a concrete fact (mate, material) explains the loss. */
  errorKind?: 'tactical' | 'positional';
}

export interface GameReview {
  gameId: string;
  classifierVersion: string;
  engineId: string;
  settings: AnalysisSettings;
  /** One evaluation per position: start + one per move. */
  evals: PositionEval[];
  /** White's win % for each position, for the graph. */
  whiteWins: number[];
  moves: MoveReview[];
  accuracy: GameAccuracy;
  accuracyByPhase: Partial<Record<Phase, GameAccuracy>>;
  opening?: { eco: string; name: string; lastBookPly: number };
  createdAt: number;
}

export interface EvalCache {
  get(fen: string, minDepth: number, multiPv: number): Promise<PositionEval | undefined>;
  put(e: PositionEval, multiPv: number): Promise<void>;
}

export interface AnalyseOptions {
  cache?: EvalCache;
  signal?: AbortSignal;
  /** Called after each position is evaluated (index into `game.moves` + 1). */
  onProgress?: (done: number, total: number, evals: (PositionEval | undefined)[]) => void;
}

/** Evaluates every position of the game (cached positions are reused). */
export async function evaluatePositions(
  game: Game,
  evaluator: Evaluator,
  settings: AnalysisSettings,
  opts: AnalyseOptions = {},
): Promise<PositionEval[]> {
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const evals: (PositionEval | undefined)[] = new Array(fens.length).fill(undefined);
  for (let i = 0; i < fens.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const fen = fens[i]!;
    const terminal = terminalOf(positionFromFen(fen));
    let e: PositionEval | undefined;
    if (terminal) {
      e = { fen, turn: turnOf(fen), terminal, lines: [], depth: 0, source: 'rules' };
    } else {
      e = await opts.cache?.get(fen, settings.depth, settings.multiPv);
      if (!e) {
        e = await evaluator.evaluate(fen, { depth: settings.depth, multiPv: settings.multiPv });
        await opts.cache?.put(e, settings.multiPv);
      }
    }
    evals[i] = e;
    opts.onProgress?.(i + 1, fens.length, evals);
  }
  return evals as PositionEval[];
}

/** Turns evaluations into a review. Pure: same inputs, same review. */
export function buildReview(
  game: Game,
  evals: readonly PositionEval[],
  book: OpeningBook,
  settings: AnalysisSettings,
  engineId: string,
): GameReview {
  if (evals.length !== game.moves.length + 1) throw new Error('one evaluation per position is required');
  const positions = [positionFromFen(game.startFen), ...game.moves.map((m) => positionFromFen(m.fenAfter))];
  const phases = phasesOf(positions);
  const whiteWins = evals.map(positionWhiteWinPercent);

  let inBook = true;
  let opening: GameReview['opening'];
  const moves: MoveReview[] = [];
  game.moves.forEach((m, i) => {
    const before = evals[i]!;
    const after = evals[i + 1]!;
    inBook = inBook && isBookPosition(book, m.fenAfter);
    const named = inBook ? openingAt(book, m.fenAfter) : undefined;
    if (named) opening = { ...named, lastBookPly: m.ply };
    else if (inBook && opening) opening.lastBookPly = m.ply;

    const prev = game.moves[i - 1];
    const isRecapture = !!prev && prev.san.includes('x') && m.san.includes('x') && prev.uci.slice(2, 4) === m.uci.slice(2, 4);
    const prevClass = moves[i - 1]?.assessment.classification;
    const assessment = classifyMove({
      uci: m.uci,
      color: m.color,
      before,
      after,
      legalMoves: legalMoveCount(positions[i]!),
      inBook,
      isRecapture,
      ...(prevClass ? { previousOpponentClass: prevClass } : {}),
    });
    const bestLine = before.lines[0] ? replayUci(m.fenBefore, before.lines[0].pv, 10) : [];
    const isError = ERROR_CLASSES.has(assessment.classification);
    const facts = isError
      ? detectFacts({ uci: m.uci, color: m.color, fenBefore: m.fenBefore, fenAfter: m.fenAfter, before, after })
      : [];
    const label = moveNumberLabel(m.ply);
    const explanation = explainMove({
      san: m.san,
      uci: m.uci,
      moveLabel: label,
      color: m.color,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      assessment,
      facts,
      bestLine,
      ...(opening ? { openingName: opening.name } : {}),
    });
    const review: MoveReview = {
      ply: m.ply,
      color: m.color,
      san: m.san,
      uci: m.uci,
      label,
      phase: phases[i + 1] ?? 'opening',
      assessment,
      bestLine,
      facts,
      explanation,
      isKeyMoment: false,
    };
    if (isError) {
      review.errorKind = facts.some((f) => f.kind !== 'eval_drop') ? 'tactical' : 'positional';
    }
    moves.push(review);
  });

  markKeyMoments(moves, opening?.lastBookPly);

  const startColor = turnOf(game.startFen);
  const counted = (i: number) => {
    const c = moves[i]?.assessment.classification;
    return c !== 'book' && c !== 'forced';
  };
  const accuracy = gameAccuracy(whiteWins, startColor, counted);
  const accuracyByPhase: GameReview['accuracyByPhase'] = {};
  for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
    const idx = moves.map((m, i) => (m.phase === phase ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const first = idx[0]!;
    const last = idx[idx.length - 1]!;
    const slice = whiteWins.slice(first, last + 2);
    const sliceStart = turnOf(evals[first]!.fen);
    accuracyByPhase[phase] = gameAccuracy(slice, sliceStart, (j) => counted(first + j));
  }

  const review: GameReview = {
    gameId: game.id,
    classifierVersion: CLASSIFIER_VERSION,
    engineId,
    settings,
    evals: [...evals],
    whiteWins,
    moves,
    accuracy,
    accuracyByPhase,
    createdAt: Date.now(),
  };
  if (opening) review.opening = opening;
  return review;
}

/** Key moments: last book move, then the biggest errors and great moves, at most 8 per side. */
function markKeyMoments(moves: MoveReview[], lastBookPly: number | undefined): void {
  for (const color of ['white', 'black'] as const) {
    const candidates = moves
      .filter((m) => m.color === color && KEY_CLASSES.has(m.assessment.classification))
      .sort((a, b) => b.assessment.winLoss - a.assessment.winLoss)
      .slice(0, 8);
    for (const m of candidates) m.isKeyMoment = true;
  }
  const lastBook = moves.find((m) => m.ply === lastBookPly);
  if (lastBook) lastBook.isKeyMoment = true;
}

export function classificationCounts(review: GameReview, color: Color): Record<Classification, number> {
  const counts = {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0,
    forced: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0,
  } satisfies Record<Classification, number>;
  for (const m of review.moves) if (m.color === color) counts[m.assessment.classification]++;
  return counts;
}

/** Full pipeline: evaluate positions, then build the review. */
export async function analyseGame(
  game: Game,
  evaluator: Evaluator,
  book: OpeningBook,
  settings: AnalysisSettings = DEFAULT_SETTINGS,
  opts: AnalyseOptions = {},
): Promise<GameReview> {
  const evals = await evaluatePositions(game, evaluator, settings, opts);
  return buildReview(game, evals, book, settings, evaluator.id);
}
