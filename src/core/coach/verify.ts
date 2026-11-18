import type { Classification } from '../classify';
import type { Vocabulary } from './sheet';

/** The model's answer, constrained by a JSON schema on the server. */
export interface CoachText {
  headline: string;
  explanation: string;
  why_better: string;
  lesson: string;
  cited_facts: string[];
}

export interface Verdict {
  ok: boolean;
  problems: string[];
}

const PIECE_WORDS: Record<string, string> = {
  king: 'king',
  queen: 'queen',
  rook: 'rook',
  bishop: 'bishop',
  knight: 'knight',
  pawn: 'pawn',
};

/** SAN moves (piece moves, captures, castling, promotions). */
const SAN_RE = /\b(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?/g;
const SQUARE_RE = /\b[a-h][1-8]\b/g;
const PIECE_ON_RE = /\b(king|queen|rook|bishop|knight|pawn)s?\s+(?:on|from|to|at)\s+([a-h][1-8])\b/gi;
const PERCENT_RE = /(\d+(?:\.\d+)?)\s?%/g;
const MATE_IN_RE = /mate in (\d+)/gi;

const CLASS_WORDS: [RegExp, Classification[]][] = [
  [/\bblunder/i, ['blunder']],
  [/\bmistake/i, ['mistake', 'miss']],
  [/\binaccura/i, ['inaccuracy']],
  [/\bbrilliant/i, ['brilliant']],
  [/\bbest move\b/i, ['best', 'great', 'brilliant']],
];

/**
 * Accepts a text only if every move, square, piece placement, percentage and
 * mate length it mentions comes from the fact sheet, and if its headline does
 * not contradict the move's classification.
 */
export function verifyCoachText(t: CoachText, v: Vocabulary, factIds: readonly string[]): Verdict {
  const problems: string[] = [];
  const all = [t.headline, t.explanation, t.why_better, t.lesson].join('\n');

  for (const m of all.matchAll(SAN_RE)) {
    const san = m[0].replace(/[+#]/g, '');
    if (!v.sans.has(san)) problems.push(`move ${m[0]} is not in the fact sheet`);
  }
  for (const m of all.matchAll(SQUARE_RE)) {
    if (!v.squares.has(m[0]) && ![...v.sans].some((s) => s.includes(m[0]))) {
      problems.push(`square ${m[0]} is not in the fact sheet`);
    }
  }
  for (const m of all.matchAll(PIECE_ON_RE)) {
    const role = PIECE_WORDS[m[1]!.toLowerCase()];
    if (role && !v.pieces.has(`${role} ${m[2]}`)) problems.push(`there is no ${role} on ${m[2]} in the positions of the fact sheet`);
  }
  for (const m of all.matchAll(PERCENT_RE)) {
    const n = Math.round(Number(m[1]));
    if (![...v.numbers].some((x) => Math.abs(x - n) <= 1)) problems.push(`${m[0]} is not a number from the fact sheet`);
  }
  for (const m of all.matchAll(MATE_IN_RE)) {
    if (!v.numbers.has(Number(m[1]))) problems.push(`"${m[0]}" does not match the fact sheet`);
  }
  for (const [re, classes] of CLASS_WORDS) {
    if (re.test(t.headline) && !classes.includes(v.classification)) {
      problems.push(`the headline contradicts the classification (${v.classification})`);
    }
  }
  const unknown = t.cited_facts.filter((id) => !factIds.includes(id));
  if (unknown.length) problems.push(`unknown fact ids: ${unknown.join(', ')}`);
  if (t.cited_facts.length === 0) problems.push('no fact is cited');
  for (const field of ['headline', 'explanation', 'lesson'] as const) {
    if (!t[field].trim()) problems.push(`${field} is empty`);
  }
  if (t.explanation.length > 900) problems.push('explanation is too long');
  return { ok: problems.length === 0, problems };
}
