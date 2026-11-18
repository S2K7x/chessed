import type { Chess } from 'chessops/chess';
import type { NormalMove, Square } from 'chessops/types';
import { legalUci, PIECE_VALUES, positionFromFen } from '../chess';
import type { Color } from '../eval';
import { pieceAt, staticExchange, type PieceAt } from './board';

/**
 * A piece the move offers to the opponent: the opponent can win at least
 * `investment` points of material by taking it, the move created (or
 * increased) that offer, and the material does not come straight back.
 *
 * Rules (classifier v1.1, see docs/CLASSIFICATION.md), inspired by the public
 * description of Chess-Review's Brilliant policy, re-implemented here:
 * 1. a knight, bishop, rook or queen of the mover can be won by static exchange;
 * 2. the move created or increased that offer (it was not already hanging);
 * 3. net of what the move itself captured, the offer costs at least 2 points;
 * 4. after the opponent's cheapest legal capture, the mover cannot win the
 *    material straight back with a capture (no short refund).
 */
export interface Sacrifice {
  piece: PieceAt;
  investment: number;
}

export const MIN_INVESTMENT = 2;

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

function legalCapturesOn(pos: Chess, square: Square): NormalMove[] {
  const out: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    if (!dests.has(square)) continue;
    const piece = pos.board.get(from)!;
    const lastRank = square >> 3 === (piece.color === 'white' ? 7 : 0);
    out.push(piece.role === 'pawn' && lastRank ? { from, to: square, promotion: 'queen' } : { from, to: square });
  }
  return out;
}

/** Best material the side to move can win back at once by a capture (static exchange). */
function bestRefund(pos: Chess): number {
  const enemy = other(pos.turn);
  let best = 0;
  for (const sq of pos.board[enemy]) best = Math.max(best, staticExchange(pos, sq, pos.turn));
  return best;
}

export function findSacrifice(fenBefore: string, uci: string): Sacrifice | undefined {
  const before = positionFromFen(fenBefore);
  const move = legalUci(before, uci);
  if (!move || !('from' in move)) return undefined;
  const mover = before.turn;
  const opp = other(mover);
  const capturedPiece = before.board.get(move.to);
  const capturedValue = capturedPiece && capturedPiece.color === opp ? PIECE_VALUES[capturedPiece.role] : 0;

  const after = before.clone();
  after.play(move);
  if (after.isCheckmate()) return undefined;

  let best: Sacrifice | undefined;
  for (const sq of after.board[mover]) {
    const piece = after.board.get(sq)!;
    if (piece.role === 'pawn' || piece.role === 'king') continue;
    const offered = staticExchange(after, sq, opp);
    if (offered < MIN_INVESTMENT) continue;
    const origin = sq === move.to ? move.from : sq;
    const already = staticExchange(before, origin, opp);
    if (offered - already < MIN_INVESTMENT) continue;
    const investment = offered - capturedValue;
    if (investment < MIN_INVESTMENT) continue;

    // The opponent must actually be able to take it now (legal moves, pins and checks included).
    const takes = legalCapturesOn(after, sq);
    if (takes.length === 0) continue;
    const cheapest = takes.reduce((a, b) =>
      PIECE_VALUES[after.board.get(a.from)!.role] <= PIECE_VALUES[after.board.get(b.from)!.role] ? a : b,
    );
    const accepted = after.clone();
    accepted.play(cheapest);
    if (bestRefund(accepted) >= investment) continue;

    if (!best || investment > best.investment) {
      const p = pieceAt(after.board, sq);
      if (p) best = { piece: p, investment };
    }
  }
  return best;
}
