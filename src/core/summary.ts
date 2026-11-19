import { ERROR_CLASSES } from './classify';
import type { Color } from './eval';
import type { Fact } from './facts';
import type { GameReview, MoveReview } from './review';
import { cap, getLocale, list, t, translate, type MessageKey } from '../i18n';
import { en } from '../i18n/en';

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

/** One sentence about the opening, shared by both sides. */
export function openingSentence(review: GameReview, lastBookMove?: string): string | undefined {
  if (!review.opening) return undefined;
  return lastBookMove ? t('summary.leftTheory', { opening: review.opening.name, move: lastBookMove }) : t('summary.opening', { opening: review.opening.name });
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A few plain sentences about one side's game, from the review only. */
export function summarise(review: GameReview, color: Color): string[] {
  const own = review.moves.filter((m) => m.color === color);
  const out: string[] = [];

  const errors = own.filter((m) => ERROR_CLASSES.has(m.assessment.classification));
  const count = (c: string) => errors.filter((m) => m.assessment.classification === c).length;
  const serious = count('blunder') + count('mistake') + count('miss');
  if (serious === 0) {
    out.push(errors.length === 0 ? t('summary.noErrors') : t('summary.onlyInaccuracies', { count: errors.length }));
  } else {
    const parts = [
      count('blunder') ? t('summary.blunders', { count: count('blunder') }) : '',
      count('mistake') ? t('summary.mistakes', { count: count('mistake') }) : '',
      count('miss') ? t('summary.misses', { count: count('miss') }) : '',
    ].filter(Boolean);
    const tactical = errors.filter((m) => m.errorKind === 'tactical' && m.assessment.classification !== 'inaccuracy').length;
    const kind =
      tactical === 0 ? '' : serious === 1 ? t('summary.tacticalOne') : tactical === serious ? t('summary.tacticalAll') : t('summary.tacticalSome', { count: tactical });
    out.push(`${cap(list(parts))}${kind}.`);
  }

  const worst = [...own].sort((a, b) => b.assessment.winLoss - a.assessment.winLoss)[0];
  if (worst && worst.assessment.winLoss >= 10) {
    out.push(
      t('summary.turningPoint', {
        move: `${worst.label} ${worst.san}`,
        before: Math.round(worst.assessment.winBefore),
        after: Math.round(worst.assessment.winAfter),
        text: worst.explanation.summary,
      }),
    );
  }

  // The theme that cost the most winning chances overall.
  const themes = new Map<string, number>();
  for (const m of errors) {
    const th = errorTheme(m);
    if (th) themes.set(th, (themes.get(th) ?? 0) + m.assessment.winLoss);
  }
  const top = [...themes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && serious > 0) {
    const lesson = errors.find((m) => errorTheme(m) === top[0])?.explanation.lesson;
    out.push(`${t('summary.theme', { theme: themeName(top[0]) })}${lesson ? ` ${lesson}` : ''}`);
  }

  const fastSerious = errors.filter((m) => m.fast && m.assessment.classification !== 'inaccuracy').length;
  if (fastSerious > 0) out.push(t('summary.fast', { count: fastSerious }));
  const inTrouble = errors.filter((m) => m.timeTrouble).length;
  if (inTrouble > 0) out.push(t('summary.timeTrouble', { count: inTrouble }));

  const good = own.filter((m) => m.assessment.classification === 'brilliant' || m.assessment.classification === 'great');
  if (good[0]) out.push(t('summary.bestMoment', { move: `${good[0].label} ${good[0].san}`, text: lowerFirst(good[0].explanation.summary) }));
  return out;
}

/** The name of an error theme (as stored in reviews and cards) in the current language. */
export function themeName(theme: string): string {
  const key = `theme.${theme}`;
  return key in en ? translate(getLocale(), key as MessageKey) : theme;
}
