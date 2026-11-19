import { parseSquare } from 'chessops/util';
import { positionFromFen, type SanMove } from '../chess';
import { povScore, type Color, type PositionEval } from '../eval';
import { lineMaterial } from './index';
import { staticExchange } from './board';
import { motifOf } from './motifs';

/** The tactic available to the mover before this move, if the engine's best line wins material or mates. */
export function tacticalOpportunity(m: { color: Color; bestLine: readonly SanMove[] }, before: PositionEval): string | undefined {
  const best = before.lines[0];
  if (!best || before.terminal) return undefined;
  const mate = povScore(best.score, m.color).mate;
  if (mate !== undefined && mate > 0) return 'missed checkmates';
  const first = m.bestLine[0];
  if (!first) return undefined;
  const won = lineMaterial(first.fenBefore, best.pv, m.color);
  if (won.delta < 2) return undefined;
  const pattern = motifOf(first);
  if (pattern) {
    return { fork: 'forks', skewer: 'skewers', discovered_attack: 'discovered attacks', double_check: 'discovered attacks' }[pattern.kind];
  }
  if (first.san.includes('x')) {
    const pos = positionFromFen(first.fenBefore);
    const to = parseSquare(first.uci.slice(2, 4))!;
    if (staticExchange(pos, to, pos.turn) >= 2) return 'free material';
  }
  return 'tactical chances';
}

