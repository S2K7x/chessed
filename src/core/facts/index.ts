import { parseSquare } from 'chessops/util';
import { materialBalance, positionFromFen, replayUci, type SanMove } from '../chess';
import { positionPovWinPercent, povScore, type Color, type EngineLine, type PositionEval } from '../eval';
import { attackersOf, pieceAt, staticExchange, type PieceAt } from './board';
import { isBackRankMate, isPinnedToKing, matePattern, motifOf, type MatePattern, type Motif } from './motifs';
import { positionalFacts, type PositionalFact } from './positional';

export type { PieceAt } from './board';

/**
 * Facts are verifiable statements about a move, computed from the board and
 * the engine's lines. Explanations (templates or a language model) may only
 * talk about what a fact contains: pieces, squares and moves listed here.
 */
export type PatternKind = Motif['kind'];

export type Fact =
  | { kind: 'mate_allowed'; mateIn: number; line: SanMove[]; backRank: boolean; pattern?: MatePattern }
  | { kind: 'mate_missed'; mateIn: number; line: SanMove[]; backRank: boolean; pattern?: MatePattern }
  | {
      kind: 'material_lost';
      amount: number;
      motif: PatternKind | 'pin' | 'moved_piece_unsafe' | 'piece_left_hanging' | 'removed_defender' | 'combination';
      /** The mover's first piece lost in the line. */
      piece?: PieceAt;
      /** For `removed_defender`: the moved piece that was defending. */
      defender?: PieceAt;
      /** The tactical pattern of the opponent's reply, when there is one. */
      pattern?: Motif;
      line: SanMove[];
    }
  | {
      kind: 'missed_material';
      amount: number;
      motif: PatternKind | 'free_capture' | 'combination';
      piece?: PieceAt;
      pattern?: Motif;
      line: SanMove[];
    }
  | { kind: 'endgame_thrown'; from: 'win' | 'draw'; to: 'draw' | 'loss'; bestLine: SanMove[] }
  | { kind: 'castling_lost' }
  | PositionalFact
  | { kind: 'eval_drop'; line: SanMove[]; bestLine: SanMove[] };

/** Plies of a line used to measure material: enough for an exchange or a fork. */
const MAX_PLIES = 8;
const MATERIAL_THRESHOLD = 2;

interface LineMaterial {
  /** Material change for `color` over the quiet prefix of the line. */
  delta: number;
  line: SanMove[];
}

/**
 * Material change for `color` along `pv`, measured at the last quiet point
 * within `maxPlies` (a position not in the middle of an exchange: neither the
 * move that reached it nor the next one is a capture). Measuring at a quiet
 * point avoids counting an exchange in progress as a loss, and looking up to
 * the last one lets checks followed by a capture (forks) count.
 */
export function lineMaterial(fen: string, pv: readonly string[], color: Color, maxPlies = MAX_PLIES): LineMaterial {
  const moves = replayUci(fen, pv, maxPlies);
  const start = materialBalance(positionFromFen(fen), color);
  let end = 0;
  for (let k = moves.length; k >= 1; k--) {
    const reached = moves[k - 1]!;
    const next = moves[k];
    if (!isCapture(reached) && (!next || !isCapture(next))) {
      end = k;
      break;
    }
  }
  if (end === 0) end = moves.length;
  const line = moves.slice(0, end);
  const last = line[line.length - 1];
  const delta = last ? materialBalance(positionFromFen(last.fenAfter), color) - start : 0;
  return { delta, line };
}

const isCapture = (m: SanMove) => m.san.includes('x');

const mateFor = (line: EngineLine | undefined, color: Color): number | undefined => {
  if (!line) return undefined;
  return povScore(line.score, color).mate;
};

export interface FactContext {
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  before: PositionEval;
  after: PositionEval;
  /** Ply of the move (1 = White's first), for opening themes. */
  ply?: number;
}

/** Facts explaining what a move changed, most important first. */
export function detectFacts(ctx: FactContext): Fact[] {
  const facts: Fact[] = [];
  const { color, before, after } = ctx;
  const bestLine = before.lines[0];
  const punishLine = after.lines[0];
  const bestUci = bestLine?.pv[0];
  const playedBest = bestUci === ctx.uci;

  // Tablebase verdicts are exact: a won or drawn endgame thrown away.
  if (before.source === 'tablebase' && after.source === 'tablebase' && !playedBest) {
    const wb = positionPovWinPercent(before, color);
    const wa = positionPovWinPercent(after, color);
    const verdict = (w: number) => (w >= 90 ? 'win' : w <= 10 ? 'loss' : 'draw');
    const from = verdict(wb);
    const to = verdict(wa);
    if ((from === 'win' && to !== 'win') || (from === 'draw' && to === 'loss')) {
      facts.push({ kind: 'endgame_thrown', from, to, bestLine: bestLine ? replayUci(ctx.fenBefore, bestLine.pv, 1) : [] });
    }
  }

  // Mate the mover now allows.
  const oppMate = mateFor(punishLine, color);
  const hadOppMate = mateFor(bestLine, color);
  if (punishLine && oppMate !== undefined && oppMate < 0 && !(hadOppMate !== undefined && hadOppMate < 0)) {
    const n = -oppMate;
    const line = replayUci(ctx.fenAfter, punishLine.pv, 2 * n - 1);
    const pattern = matePattern(line);
    facts.push({ kind: 'mate_allowed', mateIn: n, line, backRank: isBackRankMate(line), ...(pattern ? { pattern } : {}) });
  }

  // Mate the mover had and no longer has.
  const ownMate = mateFor(bestLine, color);
  const stillMate = after.terminal === 'checkmate' || ((mateFor(punishLine, color) ?? 0) > 0);
  if (bestLine && ownMate !== undefined && ownMate > 0 && !playedBest && !stillMate) {
    const line = replayUci(ctx.fenBefore, bestLine.pv, 2 * ownMate - 1);
    const pattern = matePattern(line);
    facts.push({ kind: 'mate_missed', mateIn: ownMate, line, backRank: isBackRankMate(line), ...(pattern ? { pattern } : {}) });
  }

  // Material the opponent wins after the move.
  if (punishLine && !after.terminal) {
    const lost = lineMaterial(ctx.fenAfter, punishLine.pv, color);
    if (-lost.delta >= MATERIAL_THRESHOLD) facts.push(materialLostFact(ctx, lost));
  }

  // Material the mover could have won.
  if (bestLine && !playedBest) {
    const won = lineMaterial(ctx.fenBefore, bestLine.pv, color);
    const got = punishLine && !after.terminal ? lineMaterial(ctx.fenAfter, punishLine.pv, color).delta : 0;
    const playedGain = materialBalance(positionFromFen(ctx.fenAfter), color) - materialBalance(positionFromFen(ctx.fenBefore), color) + got;
    if (won.delta >= MATERIAL_THRESHOLD && won.delta - playedGain >= MATERIAL_THRESHOLD) {
      facts.push(missedMaterialFact(ctx.fenBefore, won));
    }
  }

  if (lostCastling(ctx)) facts.push({ kind: 'castling_lost' });

  if (!facts.some((f) => f.kind !== 'castling_lost') && bestLine && !playedBest) {
    const [played] = replayUci(ctx.fenBefore, [ctx.uci]);
    const [best] = replayUci(ctx.fenBefore, bestLine.pv, 1);
    if (played) facts.push(...positionalFacts(played, color, ctx.ply ?? 99, best));
  }

  if (!facts.some((f) => f.kind !== 'castling_lost' && f.kind !== 'positional') && bestLine && punishLine && !playedBest) {
    facts.push({
      kind: 'eval_drop',
      line: replayUci(ctx.fenAfter, punishLine.pv, 6),
      bestLine: replayUci(ctx.fenBefore, bestLine.pv, 6),
    });
  }
  return facts;
}

function materialLostFact(ctx: FactContext, lost: LineMaterial): Fact {
  const amount = -lost.delta;
  const line = lost.line;
  const reply = line[0];
  const base = { kind: 'material_lost' as const, amount, line };
  if (!reply) return { ...base, motif: 'combination' };

  // A tactical pattern in the opponent's reply (double check, discovered attack, fork, skewer).
  const pattern = motifOf(reply);
  if (pattern) return { ...base, motif: pattern.kind, pattern };

  // The first of the mover's pieces captured in the line.
  const firstCapture = line.find((m, i) => i % 2 === 0 && m.san.includes('x'));
  if (!firstCapture) return { ...base, motif: 'combination' };
  const capturedSq = parseSquare(firstCapture.uci.slice(2, 4))!;
  const boardAtCapture = positionFromFen(firstCapture.fenBefore).board;
  const piece = pieceAt(boardAtCapture, capturedSq);
  const withPiece = piece ? { piece } : {};
  if (piece && piece.role !== 'pawn' && isPinnedToKing(boardAtCapture, capturedSq)) {
    return { ...base, motif: 'pin', ...withPiece };
  }
  if (firstCapture !== reply) return { ...base, motif: 'combination', ...withPiece };

  const movedTo = parseSquare(ctx.uci.slice(2, 4))!;
  const movedFrom = parseSquare(ctx.uci.slice(0, 2))!;
  if (capturedSq === movedTo) return { ...base, motif: 'moved_piece_unsafe', ...withPiece };

  const beforePos = positionFromFen(ctx.fenBefore);
  const opp: Color = ctx.color === 'white' ? 'black' : 'white';
  if (!attackersOf(beforePos.board, capturedSq, opp).isEmpty()) {
    const defendedBefore = attackersOf(beforePos.board, capturedSq, ctx.color).has(movedFrom);
    if (defendedBefore) {
      const defender = pieceAt(beforePos.board, movedFrom);
      return { ...base, motif: 'removed_defender', ...withPiece, ...(defender ? { defender } : {}) };
    }
    return { ...base, motif: 'piece_left_hanging', ...withPiece };
  }
  return { ...base, motif: 'combination', ...withPiece };
}

function missedMaterialFact(fenBefore: string, won: LineMaterial): Fact {
  const line = won.line;
  const first = line[0];
  const base = { kind: 'missed_material' as const, amount: won.delta, line };
  if (!first) return { ...base, motif: 'combination' };
  const pattern = motifOf(first);
  if (pattern) return { ...base, motif: pattern.kind, pattern };
  if (first.san.includes('x')) {
    const posBefore = positionFromFen(fenBefore);
    const to = parseSquare(first.uci.slice(2, 4))!;
    const piece = pieceAt(posBefore.board, to);
    // The capture itself wins material by static exchange: the piece was en prise.
    if (piece && staticExchange(posBefore, to, posBefore.turn) >= MATERIAL_THRESHOLD) {
      return { ...base, motif: 'free_capture', piece };
    }
    return { ...base, motif: 'combination', ...(piece ? { piece } : {}) };
  }
  return { ...base, motif: 'combination' };
}

/** A king move (not castling) that gives up the right to castle. */
function lostCastling(ctx: FactContext): boolean {
  const before = positionFromFen(ctx.fenBefore);
  const from = parseSquare(ctx.uci.slice(0, 2))!;
  if (before.board.get(from)?.role !== 'king') return false;
  const to = parseSquare(ctx.uci.slice(2, 4))!;
  if (Math.abs((from & 7) - (to & 7)) === 2 || before.board.get(to)?.role === 'rook') return false;
  const rank = ctx.color === 'white' ? 0 : 7;
  return [...before.castles.castlingRights].some((sq) => sq >> 3 === rank);
}
