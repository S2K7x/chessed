import { attacks, bishopAttacks, kingAttacks, knightAttacks, pawnAttacks, rookAttacks } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import type { Chess } from 'chessops/chess';
import type { SquareSet } from 'chessops/squareSet';
import type { Role, Square } from 'chessops/types';
import { PIECE_VALUES, squareName } from '../chess';
import type { Color } from '../eval';

export interface PieceAt {
  role: Role;
  color: Color;
  square: string;
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');

/** Squares of `byColor` pieces attacking `square`, given an occupancy. */
export function attackersOf(board: Board, square: Square, byColor: Color, occupied: SquareSet = board.occupied): SquareSet {
  const own = board[byColor];
  return knightAttacks(square)
    .intersect(board.knight)
    .union(kingAttacks(square).intersect(board.king))
    .union(pawnAttacks(other(byColor), square).intersect(board.pawn))
    .union(rookAttacks(square, occupied).intersect(board.rooksAndQueens()))
    .union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens()))
    .intersect(own)
    .intersect(occupied);
}

export function pieceAt(board: Board, square: Square): PieceAt | undefined {
  const p = board.get(square);
  return p ? { role: p.role, color: p.color, square: squareName(square) } : undefined;
}

/**
 * Static exchange evaluation: material `byColor` wins by starting a capture
 * sequence on `square` (0 if capturing is not worth it). Pins are ignored, so
 * this is an estimate; facts shown to the user are grounded in engine lines.
 */
export function staticExchange(pos: Chess, square: Square, byColor: Color): number {
  const board = pos.board;
  const target = board.get(square);
  if (!target || target.color === byColor) return 0;
  let occupied = board.occupied;
  const gains: number[] = [];
  let side: Color = byColor;
  let onSquare = PIECE_VALUES[target.role] || 100;
  let depth = 0;
  for (;;) {
    const attackers = attackersOf(board, square, side, occupied);
    if (attackers.isEmpty()) break;
    let from: Square | undefined;
    let value = Infinity;
    for (const sq of attackers) {
      const r = board.get(sq)!.role;
      const v = r === 'king' ? 100 : PIECE_VALUES[r];
      if (v < value) {
        value = v;
        from = sq;
      }
    }
    if (from === undefined) break;
    gains[depth] = onSquare - (depth > 0 ? gains[depth - 1]! : 0);
    onSquare = value;
    occupied = occupied.without(from);
    side = other(side);
    depth++;
    if (value === 100 && !attackersOf(board, square, side, occupied).isEmpty()) {
      // The king cannot capture into a defended square.
      depth--;
      break;
    }
  }
  while (depth > 1) {
    depth--;
    gains[depth - 1] = -Math.max(-gains[depth - 1]!, gains[depth]!);
  }
  return Math.max(0, gains[0] ?? 0);
}

/**
 * Enemy pieces the piece on `square` attacks that are worth attacking: the
 * king, a piece of higher value, or a piece that is not defended.
 */
export function forkTargets(pos: Chess, square: Square): PieceAt[] {
  const board = pos.board;
  const piece = board.get(square);
  if (!piece) return [];
  const enemy = other(piece.color);
  const seen = attacks(piece, square, board.occupied).intersect(board[enemy]);
  const targets: PieceAt[] = [];
  for (const sq of seen) {
    const t = board.get(sq)!;
    const defended = !attackersOf(board, sq, enemy).isEmpty();
    if (t.role === 'king' || PIECE_VALUES[t.role] > PIECE_VALUES[piece.role] || (!defended && t.role !== 'pawn')) {
      targets.push({ role: t.role, color: t.color, square: squareName(sq) });
    }
  }
  return targets;
}
