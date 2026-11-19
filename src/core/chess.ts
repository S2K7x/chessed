import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { makeSquare, parseSquare, parseUci, makeUci } from 'chessops/util';
import type { Move, NormalMove, Role, Square } from 'chessops/types';
import type { Color, Terminal } from './eval';

export const PIECE_VALUES: Readonly<Record<Role, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

export const ROLE_NAMES: Readonly<Record<Role, string>> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
};

export const ROLE_LETTERS: Readonly<Record<Role, string>> = {
  pawn: '',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
};

export function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap();
  return Chess.fromSetup(setup).unwrap();
}

export const fenOf = (pos: Chess): string => makeFen(pos.toSetup());

/** Board, turn, castling rights and en passant square: the identity of a position. */
export const epdOf = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

export const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

export const squareName = (sq: Square): string => makeSquare(sq);
export const squareIndex = (name: string): Square => {
  const sq = parseSquare(name);
  if (sq === undefined) throw new Error(`bad square ${name}`);
  return sq;
};

export function terminalOf(pos: Chess): Terminal | undefined {
  if (pos.isCheckmate()) return 'checkmate';
  if (pos.isStalemate()) return 'stalemate';
  if (pos.isInsufficientMaterial()) return 'insufficient';
  return undefined;
}

export function legalMoveCount(pos: Chess): number {
  let n = 0;
  for (const [, dests] of pos.allDests()) n += dests.size();
  return n;
}

/** Parses a UCI move and checks it is legal in `pos`. */
export function legalUci(pos: Chess, uci: string): Move | undefined {
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return undefined;
  return move;
}

export interface SanMove {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

/**
 * Replays UCI moves from a FEN and returns them in SAN. Stops at the first
 * illegal move, so a returned line is always legal from `fen`.
 */
export function replayUci(fen: string, ucis: readonly string[], max = Infinity): SanMove[] {
  const pos = positionFromFen(fen);
  const out: SanMove[] = [];
  for (const uci of ucis) {
    if (out.length >= max) break;
    const move = legalUci(pos, uci);
    if (!move) break;
    const fenBefore = fenOf(pos);
    const san = makeSan(pos, move);
    pos.play(move);
    out.push({ san, uci: makeUci(move), fenBefore, fenAfter: fenOf(pos) });
  }
  return out;
}

export function materialOf(pos: Chess, color: Color): number {
  let total = 0;
  for (const sq of pos.board[color]) {
    const piece = pos.board.get(sq);
    if (piece) total += PIECE_VALUES[piece.role];
  }
  return total;
}

/** Material of `color` minus the opponent's. */
export function materialBalance(pos: Chess, color: Color): number {
  return materialOf(pos, color) - materialOf(pos, color === 'white' ? 'black' : 'white');
}

/** Number of knights, bishops, rooks and queens on the board (both sides). */
export function majorsAndMinors(pos: Chess): number {
  const b = pos.board;
  return b.knight.union(b.bishop).union(b.rook).union(b.queen).size();
}

export function isNormalMove(m: Move): m is NormalMove {
  return 'from' in m;
}

/** "12." for White's 12th move, "12..." for Black's. */
export function moveNumberLabel(ply: number): string {
  const n = Math.floor((ply + 1) / 2);
  return ply % 2 === 1 ? `${n}.` : `${n}...`;
}

export { makeSan, makeUci, parseUci, makeSquare, parseSquare };

/** The UCI of a SAN move in a position, or undefined if it is not legal there. */
export function sanToUci(fen: string, san: string): string | undefined {
  const pos = positionFromFen(fen);
  const move = parseSan(pos, san);
  return move ? makeUci(move) : undefined;
}
