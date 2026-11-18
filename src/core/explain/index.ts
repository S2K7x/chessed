import type { SanMove } from '../chess';
import type { Assessment, Classification } from '../classify';
import type { Color } from '../eval';
import type { Fact, PieceAt } from '../facts';

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

export const CLASS_LABELS: Record<Classification, string> = {
  brilliant: 'Brilliant',
  great: 'Great move',
  best: 'Best move',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book move',
  forced: 'Forced',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Missed opportunity',
  blunder: 'Blunder',
};

const LESSONS = {
  moved_piece_unsafe:
    'Before you move a piece, count how many times its new square is attacked and defended.',
  piece_left_hanging:
    'Start every move by listing your pieces that are attacked. An under-defended piece comes first.',
  removed_defender:
    'Before moving a piece, check what it was protecting. Defenders have jobs.',
  fork_allowed:
    'Look for squares where an enemy knight, pawn or queen could attack two of your pieces at once, especially your king and queen.',
  combination_lost:
    "Before each move, look at your opponent's checks, captures and threats in reply.",
  mate_allowed:
    'When your king has few escape squares, check every enemy check before you move.',
  mate_missed: 'Checks, captures, threats: look at all your checks first, every move.',
  free_capture: 'Look at every capture available to you. A piece attacked more often than it is defended can be won.',
  fork_missed: 'Look for moves that attack two targets at once: a fork wins material because only one can be saved.',
  combination_missed:
    'When your pieces are active, search for forcing moves (checks and captures) before quiet ones.',
  eval_drop:
    "Compare your move with the engine's: ask what the better move improves, such as a piece, your king's safety or the pawn structure.",
  miss: "After your opponent's mistake, slow down: there is usually a concrete way to punish it.",
} as const;

export const pieceLabel = (p: PieceAt): string => `${p.role} on ${p.square}`;

const pct = (x: number) => `${Math.round(x)}%`;

function listTargets(targets: PieceAt[]): string {
  const names = targets.map(pieceLabel);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
  const label = CLASS_LABELS[c];
  const title = `${input.moveLabel} ${san}: ${label}`;
  const best = bestLine[0];
  const winText = `Your winning chances went from ${pct(a.winBefore)} to ${pct(a.winAfter)}.`;
  const lines: PlayableLine[] = [];
  const arrows: Arrow[] = [];

  if (isGoodClass(c)) {
    let summary: string;
    const details: string[] = [];
    switch (c) {
      case 'book':
        summary = input.openingName ? `A known opening move (${input.openingName}).` : 'A known opening move.';
        break;
      case 'forced':
        summary = 'The only legal move.';
        break;
      case 'great':
        summary = 'The only good move in the position.';
        if (a.secondBestLoss !== undefined) {
          details.push(`Every alternative was clearly worse: the next best move would have cost ${pct(a.secondBestLoss)} of your winning chances.`);
        }
        break;
      case 'best':
        summary = "The engine's top choice.";
        break;
      case 'excellent':
        summary = 'Almost as strong as the best move.';
        break;
      default:
        summary = 'A reasonable move, slightly weaker than the best.';
    }
    if ((c === 'excellent' || c === 'good') && best && best.san !== san) {
      details.push(`The engine preferred ${best.san}.`);
      lines.push({ label: `Best line: ${best.san}`, fen: input.fenBefore, moves: bestLine.slice(0, 8) });
      arrows.push(...arrowOf(best, 'best'));
    }
    const out: Explanation = { title, summary, details, lines, arrows };
    if (c === 'good' && best) out.better = { san: best.san, text: `${best.san} kept a little more.` };
    return out;
  }

  // Errors: explain with the most important fact.
  const fact = facts[0];
  const details: string[] = [];
  let summary = winText;
  let lesson: string = LESSONS.eval_drop;

  if (fact) {
    switch (fact.kind) {
      case 'mate_allowed': {
        summary = `This allows a forced checkmate in ${fact.mateIn}.`;
        details.push(`After ${formatLine(fact.line, 1)}, your king cannot escape: ${formatLine(fact.line)}.`);
        lines.push({ label: 'The mating line', fen: input.fenAfter, moves: fact.line });
        arrows.push(...arrowOf(fact.line[0], 'threat'));
        lesson = LESSONS.mate_allowed;
        break;
      }
      case 'mate_missed': {
        summary = `You had a forced checkmate in ${fact.mateIn}.`;
        details.push(`${formatLine(fact.line)} would have ended the game.`);
        lines.push({ label: 'The missed mate', fen: input.fenBefore, moves: fact.line });
        arrows.push(...arrowOf(fact.line[0], 'best'));
        lesson = LESSONS.mate_missed;
        break;
      }
      case 'material_lost': {
        const reply = fact.line[0];
        const what = fact.piece ? `your ${pieceLabel(fact.piece)}` : 'material';
        switch (fact.motif) {
          case 'moved_piece_unsafe':
            summary = `${san} puts ${what} on a square where it can be taken.`;
            lesson = LESSONS.moved_piece_unsafe;
            break;
          case 'piece_left_hanging':
            summary = `${san} leaves ${what} under-defended, and your opponent can win it.`;
            lesson = LESSONS.piece_left_hanging;
            break;
          case 'removed_defender':
            summary = fact.defender
              ? `Your ${pieceLabel(fact.defender)} was protecting ${what}; after ${san} it is no longer defended.`
              : `${san} removes a defender of ${what}.`;
            lesson = LESSONS.removed_defender;
            break;
          case 'fork':
            summary = fact.fork
              ? `${san} allows ${reply?.san ?? 'a fork'}: the ${pieceLabel(fact.fork.by)} attacks your ${listTargets(fact.fork.targets)} at the same time.`
              : `${san} allows a fork.`;
            lesson = LESSONS.fork_allowed;
            break;
          default:
            summary = `${san} allows a combination that wins ${what}.`;
            lesson = LESSONS.combination_lost;
        }
        details.push(`Your opponent's best reply: ${formatLine(fact.line)}, and you are down about ${fact.amount} point${fact.amount > 1 ? 's' : ''} of material.`);
        lines.push({ label: 'What your opponent threatens', fen: input.fenAfter, moves: fact.line });
        arrows.push(...arrowOf(reply, 'threat'));
        break;
      }
      case 'missed_material': {
        const first = fact.line[0];
        switch (fact.motif) {
          case 'free_capture':
            summary = fact.piece
              ? `You could have won the ${pieceLabel(fact.piece)} with ${first?.san}.`
              : `You could have won material with ${first?.san}.`;
            lesson = LESSONS.free_capture;
            break;
          case 'fork':
            summary = fact.fork
              ? `${first?.san} was a fork: the ${pieceLabel(fact.fork.by)} would attack the ${listTargets(fact.fork.targets)}.`
              : `${first?.san} was a fork.`;
            lesson = LESSONS.fork_missed;
            break;
          default:
            summary = `${first?.san} started a sequence that wins material.`;
            lesson = LESSONS.combination_missed;
        }
        details.push(`${formatLine(fact.line)} wins about ${fact.amount} point${fact.amount > 1 ? 's' : ''} of material.`);
        lines.push({ label: 'The missed line', fen: input.fenBefore, moves: fact.line });
        arrows.push(...arrowOf(first, 'best'));
        break;
      }
      case 'eval_drop': {
        summary = `${san} does not lose material right away, but it worsens your position. ${winText}`;
        if (fact.line.length > 0) {
          details.push(`The engine expects ${formatLine(fact.line, 6)}.`);
          lines.push({ label: "The engine's continuation", fen: input.fenAfter, moves: fact.line });
        }
        lesson = LESSONS.eval_drop;
        break;
      }
    }
  }
  if (c === 'miss') {
    details.unshift("Your opponent's previous move was an error, and this move lets the advantage slip.");
    lesson = LESSONS.miss;
  }
  if (fact?.kind !== 'mate_allowed' && fact?.kind !== 'eval_drop') details.push(winText);

  const out: Explanation = { title, summary, details, lines, arrows, lesson };
  arrows.push({ from: input.uci.slice(0, 2), to: input.uci.slice(2, 4), brush: 'played' });
  if (best && best.san !== san) {
    out.better = { san: best.san, text: betterText(best.san, facts) };
    if (!lines.some((l) => l.fen === input.fenBefore)) {
      lines.push({ label: `Best line: ${best.san}`, fen: input.fenBefore, moves: bestLine.slice(0, 8) });
    }
    if (!arrows.some((x) => x.brush === 'best')) arrows.push(...arrowOf(best, 'best'));
  }
  return out;
}

function betterText(bestSan: string, facts: Fact[]): string {
  const missed = facts.find((f) => f.kind === 'missed_material' || f.kind === 'mate_missed');
  if (missed?.kind === 'mate_missed') return `${bestSan} starts a forced mate.`;
  if (missed?.kind === 'missed_material') return `${bestSan} wins material.`;
  return `${bestSan} was the engine's choice and keeps the balance better.`;
}
