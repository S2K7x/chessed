import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import { positionFromFen, squareName, type SanMove } from '../chess';
import type { Color } from '../eval';

/**
 * Structural consequences of a quiet move, used to explain positional errors
 * (losses without a concrete tactic). Each theme is a plain board fact.
 */
export type PositionalTheme =
  | 'isolated_pawn'
  | 'doubled_pawns'
  | 'passed_pawn_allowed'
  | 'king_shelter'
  | 'knight_rim'
  | 'early_queen'
  | 'undeveloped';

export interface PositionalFact {
  kind: 'positional';
  theme: PositionalTheme;
  squares: string[];
  /** The engine's move develops a minor piece (SAN), for development themes. */
  bestDevelops?: string;
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const file = (sq: number) => sq & 7;
const rank = (sq: number) => sq >> 3;

function pawns(pos: Chess, color: Color): number[] {
  return [...pos.board.pawn.intersect(pos.board[color])];
}

function isolated(pos: Chess, color: Color): Set<number> {
  const own = pawns(pos, color);
  const files = new Set(own.map(file));
  return new Set(own.filter((sq) => !files.has(file(sq) - 1) && !files.has(file(sq) + 1)));
}

function doubledFiles(pos: Chess, color: Color): Set<number> {
  const count = new Map<number, number>();
  for (const sq of pawns(pos, color)) count.set(file(sq), (count.get(file(sq)) ?? 0) + 1);
  return new Set([...count.entries()].filter(([, n]) => n >= 2).map(([f]) => f));
}

function passed(pos: Chess, color: Color): Set<number> {
  const enemy = pawns(pos, other(color));
  const ahead = (sq: number, e: number) => (color === 'white' ? rank(e) > rank(sq) : rank(e) < rank(sq));
  return new Set(pawns(pos, color).filter((sq) => !enemy.some((e) => Math.abs(file(e) - file(sq)) <= 1 && ahead(sq, e))));
}

const minorsHome = (pos: Chess, color: Color): number => {
  const home = SquareSet.fromRank(color === 'white' ? 0 : 7);
  return pos.board.knight.union(pos.board.bishop).intersect(pos.board[color]).intersect(home).size();
};

/** Facts about what a quiet move did to the structure, most important first. */
export function positionalFacts(move: SanMove, color: Color, ply: number, best?: SanMove): PositionalFact[] {
  const before = positionFromFen(move.fenBefore);
  const after = positionFromFen(move.fenAfter);
  const fromSq = squareIndexOf(move.uci.slice(0, 2));
  const toSq = squareIndexOf(move.uci.slice(2, 4));
  const piece = after.board.get(toSq);
  const out: PositionalFact[] = [];

  // King shelter: a pawn in front of the castled king moves away.
  const king = before.board.kingOf(color);
  if (piece?.role === 'pawn' && king !== undefined && rank(king) === (color === 'white' ? 0 : 7) && file(king) !== 3 && file(king) !== 4) {
    const shelterFiles = file(king) >= 5 ? [5, 6, 7] : [0, 1, 2];
    if (shelterFiles.includes(file(fromSq)) && Math.abs(rank(fromSq) - rank(king)) === 1) {
      out.push({ kind: 'positional', theme: 'king_shelter', squares: [squareName(fromSq), squareName(king)] });
    }
  }

  const newIsolated = [...isolated(after, color)].filter((sq) => !isolated(before, color).has(sq) && !(sq === toSq && isolated(before, color).has(fromSq)));
  if (newIsolated.length) out.push({ kind: 'positional', theme: 'isolated_pawn', squares: newIsolated.map(squareName) });

  const newDoubled = [...doubledFiles(after, color)].filter((f) => !doubledFiles(before, color).has(f));
  if (newDoubled.length) {
    const squares = pawns(after, color).filter((sq) => newDoubled.includes(file(sq)));
    out.push({ kind: 'positional', theme: 'doubled_pawns', squares: squares.map(squareName) });
  }

  const enemyPassed = [...passed(after, other(color))].filter((sq) => !passed(before, other(color)).has(sq));
  if (enemyPassed.length) out.push({ kind: 'positional', theme: 'passed_pawn_allowed', squares: enemyPassed.map(squareName) });

  if (piece?.role === 'knight' && (file(toSq) === 0 || file(toSq) === 7) && !move.san.includes('x')) {
    out.push({ kind: 'positional', theme: 'knight_rim', squares: [squareName(toSq)] });
  }

  // Opening development (first 12 moves).
  if (ply <= 24) {
    const bestDevelops =
      best && best.san !== move.san && /^[NB]/.test(best.san) && rank(squareIndexOf(best.uci.slice(0, 2))) === (color === 'white' ? 0 : 7)
        ? best.san
        : undefined;
    const extra = bestDevelops ? { bestDevelops } : {};
    if (piece?.role === 'queen' && minorsHome(before, color) >= 3) {
      out.push({ kind: 'positional', theme: 'early_queen', squares: [squareName(toSq)], ...extra });
    } else if (bestDevelops && minorsHome(after, color) >= 2 && piece?.role !== 'pawn') {
      out.push({ kind: 'positional', theme: 'undeveloped', squares: [squareName(toSq)], ...extra });
    }
  }
  return out;
}

function squareIndexOf(name: string): number {
  return (name.charCodeAt(0) - 97) + 8 * (Number(name[1]) - 1);
}
