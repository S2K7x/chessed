import { ERROR_CLASSES } from './classify';
import type { Color } from './eval';
import type { Fact } from './facts';
import type { GameReview, MoveReview } from './review';

/** Name of the dominant pattern behind an error, for summaries and statistics. */
export function errorTheme(m: MoveReview): string | undefined {
  const f: Fact | undefined = m.facts.find((x) => x.kind !== 'castling_lost');
  if (!f) return undefined;
  switch (f.kind) {
    case 'mate_allowed':
      return f.backRank ? 'back-rank weakness' : 'king safety';
    case 'mate_missed':
      return 'missed checkmates';
    case 'endgame_thrown':
      return 'endgame technique';
    case 'material_lost':
      switch (f.motif) {
        case 'fork':
          return 'forks';
        case 'skewer':
          return 'skewers';
        case 'pin':
          return 'pins';
        case 'discovered_attack':
        case 'double_check':
          return 'discovered attacks';
        case 'moved_piece_unsafe':
        case 'piece_left_hanging':
        case 'removed_defender':
          return 'unprotected pieces';
        default:
          return 'opponent threats';
      }
    case 'missed_material':
      return f.motif === 'free_capture' ? 'free material' : 'tactical chances';
    case 'positional':
      return { isolated_pawn: 'pawn structure', doubled_pawns: 'pawn structure', passed_pawn_allowed: 'pawn structure', king_shelter: 'king safety', knight_rim: 'piece placement', early_queen: 'opening development', undeveloped: 'opening development' }[f.theme];
    case 'eval_drop':
      return 'positional play';
  }
  return undefined;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One sentence about the opening, shared by both sides. */
export function openingSentence(review: GameReview, lastBookMove?: string): string | undefined {
  if (!review.opening) return undefined;
  return lastBookMove ? `${review.opening.name}: the game left known theory after ${lastBookMove}.` : `Opening: ${review.opening.name}.`;
}

/** A few plain sentences about one side's game, from the review only. */
export function summarise(review: GameReview, color: Color): string[] {
  const own = review.moves.filter((m) => m.color === color);
  const out: string[] = [];

  const errors = own.filter((m) => ERROR_CLASSES.has(m.assessment.classification));
  const count = (c: string) => errors.filter((m) => m.assessment.classification === c).length;
  const serious = count('blunder') + count('mistake') + count('miss');
  if (serious === 0) {
    out.push(errors.length === 0 ? 'No real errors in this game: well played.' : `Only ${plural(errors.length, 'small inaccuracy').replace('inaccuracys', 'inaccuracies')}, no serious errors.`);
  } else {
    const parts = [
      count('blunder') ? plural(count('blunder'), 'blunder') : '',
      count('mistake') ? plural(count('mistake'), 'mistake') : '',
      count('miss') ? plural(count('miss'), 'missed opportunity').replace('opportunitys', 'opportunities') : '',
    ].filter(Boolean);
    const tactical = errors.filter((m) => m.errorKind === 'tactical' && m.assessment.classification !== 'inaccuracy').length;
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    const kind = tactical === 0 ? '' : serious === 1 ? ' (tactical)' : tactical === serious ? ', all tactical' : `, ${tactical} of them tactical`;
    out.push(`${list}${kind}.`);
  }

  const worst = [...own].sort((a, b) => b.assessment.winLoss - a.assessment.winLoss)[0];
  if (worst && worst.assessment.winLoss >= 10) {
    out.push(`The turning point: ${worst.label} ${worst.san} (winning chances ${Math.round(worst.assessment.winBefore)}% → ${Math.round(worst.assessment.winAfter)}%). ${worst.explanation.summary}`);
  }

  // The theme that cost the most winning chances overall.
  const themes = new Map<string, number>();
  for (const m of errors) {
    const t = errorTheme(m);
    if (t) themes.set(t, (themes.get(t) ?? 0) + m.assessment.winLoss);
  }
  const top = [...themes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && serious > 0) {
    const lesson = errors.find((m) => errorTheme(m) === top[0])?.explanation.lesson;
    out.push(`Theme to work on: ${top[0]}.${lesson ? ` ${lesson}` : ''}`);
  }

  const inTrouble = errors.filter((m) => m.timeTrouble).length;
  if (inTrouble > 0) out.push(`${plural(inTrouble, 'error')} came with little time left on the clock.`);

  const good = own.filter((m) => m.assessment.classification === 'brilliant' || m.assessment.classification === 'great');
  if (good[0]) out.push(`Best moment: ${good[0].label} ${good[0].san}, ${good[0].explanation.summary.charAt(0).toLowerCase()}${good[0].explanation.summary.slice(1)}`);
  return out;
}
