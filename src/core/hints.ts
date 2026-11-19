import { positionFromFen, squareIndex } from './chess';
import { t } from '../i18n';
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
  if (f?.kind === 'mate_missed') return t('hint.mateIn', { n: f.mateIn });
  const pattern = best ? motifOf(best) : undefined;
  if (pattern) return t('hint.lookFor', { motif: t(`motif.${pattern.kind}`) });
  if (f?.kind === 'missed_material') return f.motif === 'free_capture' ? t('hint.free') : t('hint.forcing');
  if (best?.san.includes('+')) return t('hint.check');
  if (best?.san.includes('x')) return t('hint.captures');
  if (m.facts.some((x) => x.kind === 'mate_allowed')) return t('hint.king');
  if (m.facts.some((x) => x.kind === 'material_lost')) return t('hint.natural');
  return t('hint.quiet');
}

export function hintsFor(m: MoveReview): Hint[] {
  const best = m.bestLine[0];
  if (!best) return [];
  const from = best.uci.slice(0, 2);
  const to = best.uci.slice(2, 4);
  const piece = positionFromFen(best.fenBefore).board.get(squareIndex(from));
  return [
    { text: familyHint(m) },
    { text: piece ? t('hint.moveYour', { piece: t(`piece.your.${piece.role}`, { square: from }) }) : t('hint.movePiece', { square: from }), circle: from },
    { text: t('hint.goesTo', { square: to }), arrow: { from, to } },
  ];
}

/** Hints for "spot the threat": the kind of punishment, then the piece, then the square. */
export function threatHintsFor(m: MoveReview): Hint[] {
  const fact = m.facts.find((f) => f.kind === 'material_lost' || f.kind === 'mate_allowed');
  const reply = fact && 'line' in fact ? fact.line[0] : undefined;
  if (!fact || !reply) return [];
  let family: string;
  if (fact.kind === 'mate_allowed') family = t('hint.threat.mateIn', { n: fact.mateIn });
  else {
    switch (fact.motif) {
      case 'fork':
      case 'skewer':
        family = t('hint.lookFor', { motif: t(`motif.${fact.motif}`) });
        break;
      case 'discovered_attack':
      case 'double_check':
        family = t('hint.lookFor', { motif: t('motif.discovered_attack') });
        break;
      case 'pin':
        family = t('hint.threat.pin');
        break;
      case 'moved_piece_unsafe':
        family = t('hint.threat.unsafe');
        break;
      case 'piece_left_hanging':
      case 'removed_defender':
        family = t('hint.threat.undefended');
        break;
      default:
        family = t('hint.threat.forcing');
    }
  }
  const from = reply.uci.slice(0, 2);
  const to = reply.uci.slice(2, 4);
  const piece = positionFromFen(reply.fenBefore).board.get(squareIndex(from));
  return [
    { text: family },
    { text: piece ? t('hint.use', { piece: t(`piece.the.${piece.role}`, { square: from }) }) : t('hint.usePiece', { square: from }), circle: from },
    { text: t('hint.goesTo', { square: to }), arrow: { from, to } },
  ];
}
