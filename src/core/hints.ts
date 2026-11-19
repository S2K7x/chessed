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

/** Hints for "spot the threat": the kind of punishment, then the piece, then the square. */
export function threatHintsFor(m: MoveReview): Hint[] {
  const fact = m.facts.find((f) => f.kind === 'material_lost' || f.kind === 'mate_allowed');
  const reply = fact && 'line' in fact ? fact.line[0] : undefined;
  if (!fact || !reply) return [];
  let family: string;
  if (fact.kind === 'mate_allowed') family = `There is a forced checkmate in ${fact.mateIn}.`;
  else {
    switch (fact.motif) {
      case 'fork':
        family = 'Look for a fork.';
        break;
      case 'skewer':
        family = 'Look for a skewer.';
        break;
      case 'discovered_attack':
      case 'double_check':
        family = 'Look for a discovered attack.';
        break;
      case 'pin':
        family = 'One of the pieces cannot move: it is pinned.';
        break;
      case 'moved_piece_unsafe':
        family = 'The piece that just moved is not safe.';
        break;
      case 'piece_left_hanging':
      case 'removed_defender':
        family = 'Something is no longer defended.';
        break;
      default:
        family = 'Look at checks and captures first.';
    }
  }
  const from = reply.uci.slice(0, 2);
  const to = reply.uci.slice(2, 4);
  const piece = positionFromFen(reply.fenBefore).board.get(squareIndex(from));
  return [
    { text: family },
    { text: `Use the ${piece ? ROLE_NAMES[piece.role] : 'piece'} on ${from}.`, circle: from },
    { text: `It goes to ${to}.`, arrow: { from, to } },
  ];
}
