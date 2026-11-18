import { SquareSet } from 'chessops/squareSet';
import type { Chess } from 'chessops/chess';
import { majorsAndMinors } from './chess';

export type Phase = 'opening' | 'middlegame' | 'endgame';

const RANK_1 = SquareSet.fromRank(0);
const RANK_8 = SquareSet.fromRank(7);

/** Fewer than 4 pieces left on a side's back rank: development is done. */
function backRankSparse(pos: Chess): boolean {
  const white = pos.board.white.intersect(RANK_1).size();
  const black = pos.board.black.intersect(RANK_8).size();
  return white < 4 || black < 4;
}

/**
 * Splits a game into phases from its positions (inspired by Lichess' Divider):
 * the endgame starts when at most 6 minor/major pieces remain; the middlegame
 * when at most 10 remain, a back rank is sparse, or after move 15. Phases never
 * go backwards.
 */
export function phasesOf(positions: readonly Chess[]): Phase[] {
  const out: Phase[] = [];
  let phase: Phase = 'opening';
  positions.forEach((pos, i) => {
    const mm = majorsAndMinors(pos);
    if (phase !== 'endgame' && mm <= 6) phase = 'endgame';
    else if (phase === 'opening' && (mm <= 10 || backRankSparse(pos) || i > 30)) phase = 'middlegame';
    out.push(phase);
  });
  return out;
}
