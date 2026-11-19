import { attacks, between, kingAttacks, knightAttacks, ray } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import type { Square } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import { PIECE_VALUES, positionFromFen, type SanMove } from '../chess';
import type { Color } from '../eval';
import { attackersOf, forkTargets, pieceAt, type PieceAt } from './board';

/**
 * Tactical patterns recognised on a single move of an engine line. Each
 * detector only reports what the board shows; callers decide whether the
 * pattern explains a change of evaluation.
 */
export type Motif =
  | { kind: 'double_check'; by: PieceAt[] }
  | { kind: 'discovered_attack'; moved: PieceAt; attacker: PieceAt; target: PieceAt }
  | { kind: 'fork'; by: PieceAt; targets: PieceAt[] }
  | { kind: 'skewer'; by: PieceAt; front: PieceAt; behind: PieceAt };

const value = (role: PieceAt['role']) => (role === 'king' ? 100 : PIECE_VALUES[role]);
const isSlider = (role: PieceAt['role']) => role === 'bishop' || role === 'rook' || role === 'queen';

/** Worthwhile targets of `color`'s opponent attacked from `square` in `board`. */
function attackedTargets(board: Board, square: Square): Square[] {
  const piece = board.get(square);
  if (!piece) return [];
  const enemy: Color = piece.color === 'white' ? 'black' : 'white';
  return [...attacks(piece, square, board.occupied).intersect(board[enemy])];
}

/**
 * The pattern created by `move` (a legal move of an engine line), from the
 * point of view of the side that plays it.
 */
export function motifOf(move: SanMove): Motif | undefined {
  const before = positionFromFen(move.fenBefore);
  const after = positionFromFen(move.fenAfter);
  const to = parseSquare(move.uci.slice(2, 4))!;
  const moved = pieceAt(after.board, to);
  if (!moved) return undefined;

  const checkers = after.ctx().checkers;
  if (checkers.size() >= 2) {
    return { kind: 'double_check', by: [...checkers].map((sq) => pieceAt(after.board, sq)!).filter(Boolean) };
  }

  // Discovered attack: another piece of the mover now attacks a king or a
  // valuable target it did not attack before the move.
  for (const sq of after.board[moved.color]) {
    if (sq === to) continue;
    const attacker = after.board.get(sq)!;
    if (!isSlider(attacker.role)) continue;
    const now = attackedTargets(after.board, sq);
    const was = new Set(attackedTargets(before.board, sq));
    for (const t of now) {
      if (was.has(t)) continue;
      const target = after.board.get(t)!;
      const enemy = target.color;
      const worthwhile =
        target.role === 'king' || value(target.role) > value(attacker.role) || (attackersOf(after.board, t, enemy).isEmpty() && target.role !== 'pawn');
      if (worthwhile) {
        return { kind: 'discovered_attack', moved, attacker: pieceAt(after.board, sq)!, target: pieceAt(after.board, t)! };
      }
    }
  }

  const forks = forkTargets(after, to);
  if (forks.length >= 2) return { kind: 'fork', by: moved, targets: forks };

  // Skewer: a slider attacks a king or major piece with a piece behind it on the same line.
  if (isSlider(moved.role)) {
    for (const t of attackedTargets(after.board, to)) {
      const front = after.board.get(t)!;
      if (front.role !== 'king' && value(front.role) < 5) continue;
      const line = ray(to, t);
      for (const b of line.intersect(after.board[front.color])) {
        if (b === t) continue;
        const beyond = between(to, b);
        // `b` lies behind `t`: the segment to it passes through `t` and nothing else.
        if (!beyond.has(t) || beyond.intersect(after.board.occupied).size() !== 1) continue;
        const behind = after.board.get(b)!;
        if (behind.role === 'pawn' || value(behind.role) > value(front.role)) continue;
        return { kind: 'skewer', by: moved, front: pieceAt(after.board, t)!, behind: pieceAt(after.board, b)! };
      }
    }
  }
  return undefined;
}

/** True when the piece on `square` is pinned to its own king. */
export function isPinnedToKing(board: Board, square: Square): boolean {
  const piece = board.get(square);
  if (!piece) return false;
  const king = board.kingOf(piece.color);
  if (king === undefined) return false;
  const enemy: Color = piece.color === 'white' ? 'black' : 'white';
  const without = board.occupied.without(square);
  for (const s of board[enemy]) {
    const p = board.get(s)!;
    if (!isSlider(p.role)) continue;
    if (!ray(king, s).has(square) || !between(king, s).has(square)) continue;
    if (attacks(p, s, without).has(king) && !attacks(p, s, board.occupied).has(king)) return true;
  }
  return false;
}

/** A mate whose final move checks along the king's back rank, with the king hemmed in by its own pawns. */
export function isBackRankMate(line: readonly SanMove[]): boolean {
  const last = line[line.length - 1];
  if (!last || !last.san.endsWith('#')) return false;
  const pos = positionFromFen(last.fenAfter);
  const mated = pos.turn;
  const king = pos.board.kingOf(mated);
  if (king === undefined) return false;
  const backRank = mated === 'white' ? 0 : 7;
  if (king >> 3 !== backRank) return false;
  const to = parseSquare(last.uci.slice(2, 4))!;
  if (to >> 3 !== backRank) return false;
  const forward = mated === 'white' ? 8 : -8;
  const shield = [king + forward - 1, king + forward, king + forward + 1].filter((s) => s >= 0 && s < 64 && Math.abs((s & 7) - (king & 7)) <= 1);
  return shield.some((s) => {
    const p = pos.board.get(s);
    return p?.role === 'pawn' && p.color === mated;
  });
}

/** Named mate patterns recognised in a mating line (as Lichess tags its puzzles). */
export type MatePattern = 'smothered' | 'arabian';

const CORNERS = new Set([0, 7, 56, 63]);

/**
 * The pattern of the mate at the end of `line`: a smothered mate (a knight
 * mates a king whose neighbouring squares are all taken by its own pieces) or
 * an Arabian mate (a rook next to a cornered king, protected by a knight).
 */
export function matePattern(line: readonly SanMove[]): MatePattern | undefined {
  const last = line[line.length - 1];
  if (!last || !last.san.endsWith('#')) return undefined;
  const pos = positionFromFen(last.fenAfter);
  const mated = pos.turn;
  const mating = mated === 'white' ? 'black' : 'white';
  const king = pos.board.kingOf(mated);
  if (king === undefined) return undefined;
  const checkers = [...pos.ctx().checkers];
  if (checkers.length !== 1) return undefined;
  const checker = checkers[0]!;
  const piece = pos.board.get(checker);
  if (piece?.role === 'knight') {
    const smothered = [...kingAttacks(king)].every((s) => pos.board.get(s)?.color === mated);
    if (smothered) return 'smothered';
  }
  if (piece?.role === 'rook' && CORNERS.has(king)) {
    const adjacent = Math.abs((checker & 7) - (king & 7)) + Math.abs((checker >> 3) - (king >> 3)) === 1;
    const guarded = knightAttacks(checker).intersect(pos.board.pieces(mating, 'knight')).nonEmpty();
    if (adjacent && guarded) return 'arabian';
  }
  return undefined;
}
