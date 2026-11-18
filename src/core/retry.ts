import { legalUci, positionFromFen, replayUci, terminalOf, type SanMove } from './chess';
import { classifyMove, THRESHOLDS } from './classify';
import { explainMove, type Explanation } from './explain';
import { detectFacts } from './facts';
import type { Evaluator } from './engine';
import { positionPovWinPercent, type Color, type PositionEval } from './eval';

/**
 * "Find the better move": the user replays the position before one of their
 * mistakes. An attempt is solved when it loses at most 2 win-% points against
 * the engine's best move (Lichess accepts 0.04 winning chances, the same
 * margin), close when it loses at most 5.
 */
export type AttemptResult = 'solved' | 'close' | 'wrong';

export const SOLVED_MAX_LOSS = THRESHOLDS.excellent;
export const CLOSE_MAX_LOSS = THRESHOLDS.good;

export interface AttemptVerdict {
  result: AttemptResult;
  san: string;
  winBefore: number;
  winAfter: number;
  winLoss: number;
  /** Opponent's best reply line after the attempt (legal). */
  refutation: SanMove[];
  /** Why the attempt fails (or falls short), from the same facts as the review. */
  explanation?: Explanation;
}

export async function judgeAttempt(
  fen: string,
  attemptUci: string,
  best: PositionEval,
  evaluator: Evaluator,
  depth: number,
): Promise<AttemptVerdict> {
  const pos = positionFromFen(fen);
  if (!legalUci(pos, attemptUci)) throw new Error(`illegal attempt ${attemptUci}`);
  const color: Color = pos.turn;
  const [played] = replayUci(fen, [attemptUci]);
  if (!played) throw new Error(`illegal attempt ${attemptUci}`);
  const winBefore = positionPovWinPercent(best, color);
  const after = positionFromFen(played.fenAfter);
  const terminal = terminalOf(after);
  let afterEval: PositionEval;
  if (terminal) {
    afterEval = { fen: played.fenAfter, turn: after.turn, terminal, lines: [], depth: 0, source: 'rules' };
  } else {
    afterEval = await evaluator.evaluate(played.fenAfter, { depth, multiPv: 1 });
  }
  const isTop = best.lines[0]?.pv[0] === attemptUci;
  const winAfter = isTop ? winBefore : positionPovWinPercent(afterEval, color);
  const winLoss = Math.max(0, winBefore - winAfter);
  const result: AttemptResult = winLoss <= SOLVED_MAX_LOSS ? 'solved' : winLoss <= CLOSE_MAX_LOSS ? 'close' : 'wrong';
  const refutation = afterEval.lines[0] ? replayUci(played.fenAfter, afterEval.lines[0].pv, 6) : [];
  const verdict: AttemptVerdict = { result, san: played.san, winBefore, winAfter, winLoss, refutation };
  if (result !== 'solved') {
    const assessment = classifyMove({ uci: attemptUci, color, before: best, after: afterEval, legalMoves: 2, inBook: false });
    const facts = detectFacts({ uci: attemptUci, color, fenBefore: fen, fenAfter: played.fenAfter, before: best, after: afterEval });
    verdict.explanation = explainMove({
      san: played.san,
      uci: attemptUci,
      moveLabel: '',
      color,
      fenBefore: fen,
      fenAfter: played.fenAfter,
      assessment,
      facts,
      bestLine: best.lines[0] ? replayUci(fen, best.lines[0].pv, 8) : [],
    });
  }
  return verdict;
}
