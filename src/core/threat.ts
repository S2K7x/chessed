import { parseFen, makeFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { parseSquare } from 'chessops/util';
import { positionFromFen, replayUci, type SanMove } from './chess';
import type { Evaluator } from './engine';
import type { Color } from './eval';
import { lineMaterial } from './facts';
import { pieceAt, type PieceAt } from './facts/board';
import { motifOf, type Motif } from './facts/motifs';

/**
 * "What does my opponent threaten?" — a null-move search (as Lichess' Show
 * threat): the side to move passes, and the engine plays the opponent's best
 * move. A threat is reported only when that move mates or wins material.
 */
export type Threat =
  | { kind: 'none'; move?: SanMove }
  | { kind: 'mate'; mateIn: number; line: SanMove[] }
  | { kind: 'material'; amount: number; line: SanMove[]; target?: PieceAt; pattern?: Motif };

/** The same position with the other side to move, or undefined when the side to move is in check. */
export function nullMoveFen(fen: string): string | undefined {
  const pos = positionFromFen(fen);
  if (pos.isCheck()) return undefined;
  const setup = parseFen(fen).unwrap();
  setup.turn = setup.turn === 'white' ? 'black' : 'white';
  setup.epSquare = undefined;
  if (setup.turn === 'white') setup.fullmoves += 1;
  const flipped = Chess.fromSetup(setup);
  return flipped.isOk ? makeFen(flipped.value.toSetup()) : undefined;
}

export async function findThreat(fen: string, evaluator: Evaluator, depth: number): Promise<Threat | undefined> {
  const nullFen = nullMoveFen(fen);
  if (!nullFen) return undefined;
  const e = await evaluator.evaluate(nullFen, { depth, multiPv: 1 });
  const best = e.lines[0];
  if (!best) return { kind: 'none' };
  const threatener: Color = e.turn;
  const line = replayUci(nullFen, best.pv, 8);
  const mate = best.score.mate;
  if (mate !== undefined && (threatener === 'white' ? mate > 0 : mate < 0)) {
    const n = Math.abs(mate);
    return { kind: 'mate', mateIn: n, line: line.slice(0, 2 * n - 1) };
  }
  const won = lineMaterial(nullFen, best.pv, threatener);
  const first = line[0];
  if (won.delta >= 2 && first) {
    const capture = won.line.find((m, i) => i % 2 === 0 && m.san.includes('x'));
    const target = capture ? pieceAt(positionFromFen(capture.fenBefore).board, parseSquare(capture.uci.slice(2, 4))!) : undefined;
    const pattern = motifOf(first);
    return { kind: 'material', amount: won.delta, line: won.line, ...(target ? { target } : {}), ...(pattern ? { pattern } : {}) };
  }
  return first ? { kind: 'none', move: first } : { kind: 'none' };
}

/** One sentence about a threat, addressed to the side that must defend. */
export function describeThreat(t: Threat): string {
  switch (t.kind) {
    case 'mate':
      return `Your opponent threatens mate in ${t.mateIn}: ${t.line.map((m) => m.san).join(' ')}.`;
    case 'material': {
      const first = t.line[0]!;
      const what = t.target ? `your ${t.target.role} on ${t.target.square}` : `about ${t.amount} points of material`;
      const how = t.pattern?.kind === 'fork' ? ' (a fork)' : t.pattern?.kind === 'skewer' ? ' (a skewer)' : t.pattern?.kind === 'discovered_attack' ? ' (a discovered attack)' : '';
      return `Your opponent threatens ${first.san}${how}, winning ${what}.`;
    }
    case 'none':
      return t.move ? `No direct threat. Your opponent's most useful move would be ${t.move.san}.` : 'No direct threat.';
  }
}
