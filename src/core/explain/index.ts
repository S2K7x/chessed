import type { SanMove } from '../chess';
import type { Assessment, Classification } from '../classify';
import type { Color } from '../eval';
import type { Fact, PieceAt } from '../facts';
import type { Motif } from '../facts/motifs';
import type { PositionalTheme } from '../facts/positional';
import { cap, list, t } from '../../i18n';

/**
 * Template explanations. Every piece, square and move mentioned here comes
 * from a fact or an engine line that was replayed legally; nothing is
 * invented. This is the fallback the language-model coach must match.
 */

export type ArrowBrush = 'best' | 'threat' | 'played';

export interface Arrow {
  from: string;
  to: string;
  brush: ArrowBrush;
}

export interface PlayableLine {
  label: string;
  /** Position the line starts from. */
  fen: string;
  moves: SanMove[];
}

export interface Explanation {
  title: string;
  summary: string;
  details: string[];
  better?: { san: string; text: string };
  lesson?: string;
  lines: PlayableLine[];
  arrows: Arrow[];
}

export interface ExplainInput {
  san: string;
  uci: string;
  /** Move label, e.g. "12." or "12...". */
  moveLabel: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  assessment: Assessment;
  facts: Fact[];
  /** Best move in SAN and its line from fenBefore (legal, replayed). */
  bestLine: SanMove[];
  openingName?: string;
}

/** The name of a classification in the current language. */
export const classLabel = (c: Classification): string => t(`class.${c}`);

type LessonId =
  | 'moved_piece_unsafe' | 'piece_left_hanging' | 'removed_defender' | 'fork_allowed' | 'combination_lost' | 'mate_allowed'
  | 'mate_missed' | 'free_capture' | 'fork_missed' | 'skewer_allowed' | 'skewer_missed' | 'discovered_attack_allowed'
  | 'discovered_attack_missed' | 'double_check_allowed' | 'double_check_missed' | 'pin' | 'back_rank' | 'smothered'
  | 'endgame' | 'combination_missed' | 'eval_drop' | 'miss';
const lesson = (id: LessonId): string => t(`lesson.${id}`);

/** "knight on f3", "the knight on f3", "your knight on f3" (with the right article in each language). */
export const pieceLabel = (p: PieceAt): string => t(`piece.bare.${p.role}`, { square: p.square });
const theP = (p: PieceAt): string => t(`piece.the.${p.role}`, { square: p.square });
const yourP = (p: PieceAt): string => t(`piece.your.${p.role}`, { square: p.square });

/** One sentence describing a tactical pattern, from the side that plays it ("your" = the victim when `against` is true). */
function patternSentence(m: Motif, moveSan: string, against: boolean): string {
  const target = against ? yourP : theP;
  switch (m.kind) {
    case 'double_check':
      return t('explain.pattern.doubleCheck', { move: moveSan });
    case 'discovered_attack':
      return t('explain.pattern.discovered', { move: moveSan, moved: theP(m.moved), attacker: theP(m.attacker), target: target(m.target) });
    case 'fork':
      return t('explain.pattern.fork', { move: moveSan, by: theP(m.by), targets: listTargets(m.targets, target) });
    case 'skewer':
      return t('explain.pattern.skewer', { move: moveSan, by: theP(m.by), front: target(m.front), behind: theP(m.behind) });
  }
}

const pct = (x: number) => `${Math.round(x)}${t('common.percent')}`;

/** "your king on g1 and queen on d1" (English) or "votre roi en g1 et votre dame en d1" (French). */
function listTargets(targets: PieceAt[], withArticle: (p: PieceAt) => string): string {
  const repeat = t('grammar.repeatArticle') === 'yes';
  return list(targets.map((p, i) => (i === 0 || repeat ? withArticle(p) : pieceLabel(p))));
}

/** "13. Nf3+ Kh1 14. Nxd2" from a line and its starting position. */
export function formatLine(moves: readonly SanMove[], max = 8): string {
  const parts: string[] = [];
  moves.slice(0, max).forEach((m, i) => {
    const [, turn, , , , full] = m.fenBefore.split(' ');
    const n = Number(full);
    if (turn === 'w') parts.push(`${n}. ${m.san}`);
    else parts.push(i === 0 ? `${n}... ${m.san}` : m.san);
  });
  return parts.join(' ');
}

const arrowOf = (m: SanMove | undefined, brush: ArrowBrush): Arrow[] =>
  m ? [{ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), brush }] : [];

const isGoodClass = (c: Classification) =>
  c === 'brilliant' || c === 'great' || c === 'best' || c === 'excellent' || c === 'good' || c === 'book' || c === 'forced';

export function explainMove(input: ExplainInput): Explanation {
  const { assessment: a, san, facts, bestLine } = input;
  const c = a.classification;
  const title = t('explain.title', { label: input.moveLabel, san, cls: classLabel(c) });
  const best = bestLine[0];
  const winText = t('explain.winText', { before: pct(a.winBefore), after: pct(a.winAfter) });
  const lines: PlayableLine[] = [];
  const arrows: Arrow[] = [];
  const bestLineLabel = (s: string) => t('explain.line.best', { san: s });

  if (isGoodClass(c)) {
    let summary: string;
    const details: string[] = [];
    switch (c) {
      case 'book':
        summary = input.openingName ? t('explain.book.named', { opening: input.openingName }) : t('explain.book');
        break;
      case 'forced':
        summary = t('explain.forced');
        break;
      case 'brilliant': {
        const sac = a.sacrifice;
        summary = sac ? t('explain.brilliant.piece', { piece: yourP(sac.piece) }) : t('explain.brilliant');
        if (sac) details.push(t('explain.brilliant.detail', { count: sac.investment, after: pct(a.winAfter) }));
        break;
      }
      case 'great':
        summary = t('explain.great');
        if (a.secondBestLoss !== undefined) details.push(t('explain.great.detail', { loss: pct(a.secondBestLoss) }));
        break;
      case 'best':
        summary = t('explain.best');
        break;
      case 'excellent':
        summary = t('explain.excellent');
        break;
      default:
        summary = t('explain.good');
    }
    if ((c === 'excellent' || c === 'good') && best && best.san !== san) {
      details.push(t('explain.preferred', { san: best.san }));
      lines.push({ label: bestLineLabel(best.san), fen: input.fenBefore, moves: bestLine.slice(0, 8) });
      arrows.push(...arrowOf(best, 'best'));
    }
    if ((c === 'brilliant' || c === 'great') && bestLine.length > 1) {
      lines.push({ label: t('explain.line.why'), fen: input.fenBefore, moves: bestLine.slice(0, 8) });
    }
    const out: Explanation = { title, summary, details, lines, arrows };
    if (c === 'good' && best) out.better = { san: best.san, text: t('explain.better.little', { san: best.san }) };
    return out;
  }

  // Errors: explain with the most important fact.
  const fact = facts[0];
  const details: string[] = [];
  let summary = winText;
  let lessonText: string = lesson('eval_drop');

  if (fact) {
    switch (fact.kind) {
      case 'endgame_thrown': {
        summary =
          fact.from === 'win'
            ? t(fact.to === 'draw' ? 'explain.endgame.winToDraw' : 'explain.endgame.winToLoss')
            : t('explain.endgame.drawToLoss');
        details.push(t('explain.endgame.tablebase'));
        if (fact.bestLine[0]) details.push(t(fact.from === 'win' ? 'explain.endgame.keptWin' : 'explain.endgame.keptDraw', { san: fact.bestLine[0].san }));
        lessonText = lesson('endgame');
        break;
      }
      case 'mate_allowed': {
        summary = fact.backRank
          ? t('explain.mateAllowed.backRank', { n: fact.mateIn })
          : fact.pattern
            ? t('explain.mateAllowed.pattern', { n: fact.mateIn, pattern: t(`mate.${fact.pattern}`) })
            : t('explain.mateAllowed', { n: fact.mateIn });
        details.push(t('explain.mateAllowed.detail', { line: formatLine(fact.line) }));
        lines.push({ label: t('explain.line.mating'), fen: input.fenAfter, moves: fact.line });
        arrows.push(...arrowOf(fact.line[0], 'threat'));
        lessonText = fact.backRank ? lesson('back_rank') : fact.pattern === 'smothered' ? lesson('smothered') : lesson('mate_allowed');
        break;
      }
      case 'mate_missed': {
        summary = fact.backRank
          ? t('explain.mateMissed.backRank', { n: fact.mateIn })
          : fact.pattern
            ? t('explain.mateMissed.pattern', { n: fact.mateIn, pattern: t(`mate.${fact.pattern}`) })
            : t('explain.mateMissed', { n: fact.mateIn });
        details.push(t('explain.mateMissed.detail', { line: formatLine(fact.line) }));
        lines.push({ label: t('explain.line.missedMate'), fen: input.fenBefore, moves: fact.line });
        arrows.push(...arrowOf(fact.line[0], 'best'));
        lessonText = lesson('mate_missed');
        break;
      }
      case 'material_lost': {
        const reply = fact.line[0];
        const what = fact.piece ? yourP(fact.piece) : t('explain.material');
        switch (fact.motif) {
          case 'moved_piece_unsafe':
            summary = t('explain.lost.unsafe', { san, what });
            lessonText = lesson('moved_piece_unsafe');
            break;
          case 'piece_left_hanging':
            summary = t('explain.lost.hanging', { san, what });
            lessonText = lesson('piece_left_hanging');
            break;
          case 'removed_defender':
            summary = fact.defender
              ? t('explain.lost.defender', { san, what, defender: cap(yourP(fact.defender)) })
              : t('explain.lost.defenderAny', { san, what });
            lessonText = lesson('removed_defender');
            break;
          case 'pin':
            summary = t('explain.lost.pin', { san, what });
            lessonText = lesson('pin');
            break;
          case 'fork':
          case 'skewer':
          case 'discovered_attack':
          case 'double_check':
            summary =
              fact.pattern && reply
                ? t('explain.lost.pattern', { san, sentence: patternSentence(fact.pattern, reply.san, true) })
                : t('explain.lost.motif', { san, motif: t(`motif.${fact.motif}`) });
            lessonText = lesson(`${fact.motif}_allowed`);
            break;
          default:
            summary = t('explain.lost.combination', { san, what });
            lessonText = lesson('combination_lost');
        }
        details.push(t('explain.lost.detail', { line: formatLine(fact.line), count: fact.amount }));
        lines.push({ label: t('explain.line.threat'), fen: input.fenAfter, moves: fact.line });
        arrows.push(...arrowOf(reply, 'threat'));
        break;
      }
      case 'missed_material': {
        const first = fact.line[0];
        const firstSan = first?.san ?? '';
        switch (fact.motif) {
          case 'free_capture':
            summary = fact.piece
              ? t('explain.missed.piece', { piece: theP(fact.piece), san: firstSan })
              : t('explain.missed.material', { san: firstSan });
            lessonText = lesson('free_capture');
            break;
          case 'fork':
          case 'skewer':
          case 'discovered_attack':
          case 'double_check':
            summary =
              fact.pattern && first
                ? t('explain.missed.pattern', { sentence: patternSentence(fact.pattern, first.san, false) })
                : t('explain.missed.motif', { motif: t(`motif.${fact.motif}`) });
            lessonText = lesson(`${fact.motif}_missed`);
            break;
          default:
            summary = t('explain.missed.sequence', { san: firstSan });
            lessonText = lesson('combination_missed');
        }
        details.push(t('explain.missed.detail', { line: formatLine(fact.line), count: fact.amount }));
        lines.push({ label: t('explain.line.missed'), fen: input.fenBefore, moves: fact.line });
        arrows.push(...arrowOf(first, 'best'));
        break;
      }
      case 'positional': {
        summary = positionalSummary(fact.theme, san, fact.squares, fact.bestDevelops);
        lessonText = t(`positional.${fact.theme}.lesson`);
        const drop = facts.find((f) => f.kind === 'eval_drop');
        if (drop?.kind === 'eval_drop' && drop.line.length > 0) {
          details.push(t('explain.expects', { line: formatLine(drop.line, 6) }));
          lines.push({ label: t('explain.line.engine'), fen: input.fenAfter, moves: drop.line });
        }
        break;
      }
      case 'eval_drop': {
        summary = t('explain.evalDrop', { san, win: winText });
        if (fact.line.length > 0) {
          details.push(t('explain.expects', { line: formatLine(fact.line, 6) }));
          lines.push({ label: t('explain.line.engine'), fen: input.fenAfter, moves: fact.line });
        }
        lessonText = lesson('eval_drop');
        break;
      }
    }
  }
  if (facts.some((f) => f.kind === 'castling_lost')) details.push(t('explain.castlingLost'));
  if (c === 'miss') {
    details.unshift(t('explain.miss'));
    lessonText = lesson('miss');
  }
  if (fact?.kind !== 'mate_allowed' && fact?.kind !== 'eval_drop') details.push(winText);
  for (const extra of facts.slice(1)) {
    if (extra.kind === 'positional' && extra !== fact) details.push(positionalSummary(extra.theme, san, extra.squares, extra.bestDevelops));
  }

  const out: Explanation = { title, summary, details, lines, arrows, lesson: lessonText };
  arrows.push({ from: input.uci.slice(0, 2), to: input.uci.slice(2, 4), brush: 'played' });
  if (best && best.san !== san) {
    out.better = { san: best.san, text: betterText(best.san, facts, a) };
    if (!lines.some((l) => l.fen === input.fenBefore)) {
      lines.push({ label: bestLineLabel(best.san), fen: input.fenBefore, moves: bestLine.slice(0, 8) });
    }
    if (!arrows.some((x) => x.brush === 'best')) arrows.push(...arrowOf(best, 'best'));
  }
  return out;
}

function positionalSummary(theme: PositionalTheme, san: string, squares: string[], bestDevelops?: string): string {
  const sq = list(squares);
  switch (theme) {
    case 'king_shelter':
      return t('positional.king_shelter.summary', { san, squares: squares[1] ?? '' });
    case 'knight_rim':
      return t('positional.knight_rim.summary', { san, squares: squares[0] ?? '' });
    case 'early_queen':
      return bestDevelops ? t('positional.early_queen.summaryBest', { san, best: bestDevelops }) : t('positional.early_queen.summary', { san });
    case 'undeveloped':
      return bestDevelops ? t('positional.undeveloped.summaryBest', { san, best: bestDevelops }) : t('positional.undeveloped.summary', { san });
    default:
      return t(`positional.${theme}.summary`, { san, squares: sq });
  }
}

function betterText(bestSan: string, facts: Fact[], a: Assessment): string {
  const missed = facts.find((f) => f.kind === 'missed_material' || f.kind === 'mate_missed');
  if (missed?.kind === 'mate_missed') return t('explain.better.mate');
  if (missed?.kind === 'missed_material') return t('explain.better.material');
  return t('explain.better.chances', { san: bestSan, before: pct(a.winBefore), after: pct(a.winAfter) });
}

type GlossaryTerm =
  | 'fork' | 'pin' | 'skewer' | 'discovered_attack' | 'double_check' | 'back_rank' | 'smothered' | 'arabian'
  | 'passed_pawn' | 'isolated_pawn' | 'doubled_pawns' | 'tablebase';

/** Short definitions shown to beginners next to an explanation: the entries relevant to these facts. */
export function glossaryFor(facts: Fact[]): string[] {
  const terms = new Set<GlossaryTerm>();
  for (const f of facts) {
    if (f.kind === 'material_lost' || f.kind === 'missed_material') {
      if (f.motif === 'fork' || f.motif === 'pin' || f.motif === 'skewer' || f.motif === 'discovered_attack' || f.motif === 'double_check') terms.add(f.motif);
    }
    if ((f.kind === 'mate_allowed' || f.kind === 'mate_missed') && f.backRank) terms.add('back_rank');
    if ((f.kind === 'mate_allowed' || f.kind === 'mate_missed') && f.pattern) terms.add(f.pattern);
    if (f.kind === 'endgame_thrown') terms.add('tablebase');
    if (f.kind === 'positional') {
      if (f.theme === 'passed_pawn_allowed') terms.add('passed_pawn');
      if (f.theme === 'isolated_pawn') terms.add('isolated_pawn');
      if (f.theme === 'doubled_pawns') terms.add('doubled_pawns');
    }
  }
  return [...terms].map((term) => t(`glossary.${term}`));
}
