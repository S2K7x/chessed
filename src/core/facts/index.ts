import { parseSquare } from 'chessops/util';
import { materialBalance, positionFromFen, replayUci, type SanMove } from '../chess';
import { povScore, type Color, type EngineLine, type PositionEval } from '../eval';
import { attackersOf, forkTargets, pieceAt, staticExchange, type PieceAt } from './board';

export type { PieceAt } from './board';

/**
 * Facts are verifiable statements about a move, computed from the board and
 * the engine's lines. Explanations (templates or a language model) may only
 * talk about what a fact contains: pieces, squares and moves listed here.
 */
export type Fact =
  | { kind: 'mate_allowed'; mateIn: number; line: SanMove[] }
  | { kind: 'mate_missed'; mateIn: number; line: SanMove[] }
  | {
      kind: 'material_lost';
      amount: number;
      motif: 'moved_piece_unsafe' | 'piece_left_hanging' | 'removed_defender' | 'fork' | 'combination';
      /** The mover's first piece lost in the line. */
      piece?: PieceAt;
      /** For `removed_defender`: the moved piece that was defending. */
      defender?: PieceAt;
      fork?: { by: PieceAt; targets: PieceAt[] };
      line: SanMove[];
    }
  | {
      kind: 'missed_material';
      amount: number;
      motif: 'free_capture' | 'fork' | 'combination';
      piece?: PieceAt;
      fork?: { by: PieceAt; targets: PieceAt[] };
      line: SanMove[];
    }
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
}

/** Facts explaining what a move changed, most important first. */
export function detectFacts(ctx: FactContext): Fact[] {
  const facts: Fact[] = [];
  const { color, before, after } = ctx;
  const bestLine = before.lines[0];
  const punishLine = after.lines[0];
  const bestUci = bestLine?.pv[0];
  const playedBest = bestUci === ctx.uci;

  // Mate the mover now allows.
  const oppMate = mateFor(punishLine, color);
  const hadOppMate = mateFor(bestLine, color);
  if (punishLine && oppMate !== undefined && oppMate < 0 && !(hadOppMate !== undefined && hadOppMate < 0)) {
    const n = -oppMate;
    facts.push({ kind: 'mate_allowed', mateIn: n, line: replayUci(ctx.fenAfter, punishLine.pv, 2 * n - 1) });
  }

  // Mate the mover had and no longer has.
  const ownMate = mateFor(bestLine, color);
  const stillMate = after.terminal === 'checkmate' || ((mateFor(punishLine, color) ?? 0) > 0);
  if (bestLine && ownMate !== undefined && ownMate > 0 && !playedBest && !stillMate) {
    facts.push({ kind: 'mate_missed', mateIn: ownMate, line: replayUci(ctx.fenBefore, bestLine.pv, 2 * ownMate - 1) });
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

  if (facts.length === 0 && bestLine && punishLine && !playedBest) {
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

  // A fork by the reply: the moved piece attacks two worthwhile targets.
  const afterReply = positionFromFen(reply.fenAfter);
  const replyTo = parseSquare(reply.uci.slice(2, 4))!;
  const targets = forkTargets(afterReply, replyTo);
  const by = pieceAt(afterReply.board, replyTo);
  if (by && targets.length >= 2) {
    return { ...base, motif: 'fork', fork: { by, targets } };
  }

  // The first of the mover's pieces captured in the line.
  const firstCapture = line.find((m, i) => i % 2 === 0 && m.san.includes('x'));
  if (!firstCapture) return { ...base, motif: 'combination' };
  const capturedSq = parseSquare(firstCapture.uci.slice(2, 4))!;
  const piece = pieceAt(positionFromFen(firstCapture.fenBefore).board, capturedSq);
  const withPiece = piece ? { piece } : {};
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
  const pos = positionFromFen(first.fenAfter);
  const to = parseSquare(first.uci.slice(2, 4))!;
  const targets = forkTargets(pos, to);
  const by = pieceAt(pos.board, to);
  if (by && targets.length >= 2 && !first.san.includes('x')) {
    return { ...base, motif: 'fork', fork: { by, targets } };
  }
  if (first.san.includes('x')) {
    const posBefore = positionFromFen(fenBefore);
    const piece = pieceAt(posBefore.board, to);
    // The capture itself wins material by static exchange: the piece was en prise.
    if (piece && staticExchange(posBefore, to, posBefore.turn) >= MATERIAL_THRESHOLD) {
      return { ...base, motif: 'free_capture', piece };
    }
    return { ...base, motif: 'combination', ...(piece ? { piece } : {}) };
  }
  return { ...base, motif: 'combination' };
}
