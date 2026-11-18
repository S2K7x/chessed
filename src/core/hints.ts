import { ROLE_NAMES, positionFromFen, squareIndex } from './chess';
import type { Fact } from './facts';
import { motifOf } from './facts/motifs';
import type { MoveReview } from './review';

/** Graded hints for "find the better move": family, then piece, then target square. */
export interface Hint {
  text: string;
  /** Square to circle on the board. */
  circle?: string;
  /** Arrow from the piece to its target. */
  arrow?: { from: string; to: string };
}

function familyHint(m: MoveReview): string {
  const best = m.bestLine[0];
  const f: Fact | undefined = m.facts.find((x) => x.kind === 'mate_missed' || x.kind === 'missed_material');
  if (f?.kind === 'mate_missed') return `There is a forced checkmate in ${f.mateIn}. Look at every check.`;
  const pattern = best ? motifOf(best) : undefined;
  if (pattern) {
    const name = { fork: 'a fork', skewer: 'a skewer', discovered_attack: 'a discovered attack', double_check: 'a double check' }[pattern.kind];
    return `Look for ${name}.`;
  }
  if (f?.kind === 'missed_material') return f.motif === 'free_capture' ? 'Something can be captured for free.' : 'A forcing sequence wins material. Start with checks and captures.';
  if (best?.san.includes('+')) return 'Start with a check.';
  if (best?.san.includes('x')) return 'Look at the captures.';
  if (m.facts.some((x) => x.kind === 'mate_allowed')) return 'Before anything else, look at your king: what checks does your opponent have?';
  if (m.facts.some((x) => x.kind === 'material_lost')) return 'Some natural moves here lose material. Check what your opponent can capture after your move.';
  return 'No tactic here: look for the move that improves your worst-placed piece or your king.';
}

export function hintsFor(m: MoveReview): Hint[] {
  const best = m.bestLine[0];
  if (!best) return [];
  const from = best.uci.slice(0, 2);
  const to = best.uci.slice(2, 4);
  const piece = positionFromFen(best.fenBefore).board.get(squareIndex(from));
  const name = piece ? ROLE_NAMES[piece.role] : 'piece';
  return [
    { text: familyHint(m) },
    { text: `Move your ${name} on ${from}.`, circle: from },
    { text: `It goes to ${to}.`, arrow: { from, to } },
  ];
}
