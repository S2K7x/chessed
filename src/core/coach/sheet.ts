import { positionFromFen, squareName } from '../chess';
import type { Classification } from '../classify';
import type { Color } from '../eval';
import { classLabel, formatLine, type Explanation } from '../explain';
import { getLocale, t, type Locale } from '../../i18n';
import type { Fact, PieceAt } from '../facts';
import type { MoveReview } from '../review';

/**
 * The fact sheet is everything a language model may use to write an
 * explanation. It contains sentences we already generated and verified, plus
 * the exact moves, squares and pieces they mention. The verifier
 * (verify.ts) accepts a text only if every move, square, piece and
 * percentage it mentions comes from this sheet.
 */
export type Level = 'beginner' | 'intermediate' | 'advanced';

export const PROMPT_VERSION = 'coach-v2';

export interface SheetLine {
  id: string;
  label: string;
  /** "13. Nf3+ Kh1 14. Nxd2" */
  moves: string;
}

export interface FactSheet {
  level: Level;
  /** Language the explanation must be written in (the facts are already in it). */
  language: Locale;
  player: 'you' | 'white' | 'black';
  move: { label: string; san: string; color: Color; classification: Classification; classLabel: string };
  winBefore: number;
  winAfter: number;
  best?: { san: string };
  /** Verified sentences, each with an id the model must cite. */
  facts: { id: string; text: string }[];
  lines: SheetLine[];
  lesson?: string;
  /** What players of this level usually play here (Maia), when known. */
  typicalMove?: { san: string; share: number };
  /** Optional context: the game's opening and phase. */
  context: { phase: string; opening?: string };
}

/** Moves, squares, pieces and numbers the explanation may mention. */
export interface Vocabulary {
  sans: Set<string>;
  squares: Set<string>;
  /** "knight e5" pairs (role + square) present on the board or in facts. */
  pieces: Set<string>;
  numbers: Set<number>;
  classification: Classification;
}

const stripSan = (san: string) => san.replace(/[+#!?]/g, '');

export function levelFromElo(elo: number | undefined): Level {
  if (elo === undefined) return 'intermediate';
  if (elo < 1200) return 'beginner';
  if (elo < 1800) return 'intermediate';
  return 'advanced';
}

function addBoardPieces(fen: string, into: Set<string>): void {
  const pos = positionFromFen(fen);
  for (const sq of pos.board.occupied) {
    const p = pos.board.get(sq)!;
    into.add(`${p.role} ${squareName(sq)}`);
  }
}

const addPiece = (p: PieceAt | undefined, v: Vocabulary) => {
  if (!p) return;
  v.pieces.add(`${p.role} ${p.square}`);
  v.squares.add(p.square);
};

function factPieces(f: Fact): PieceAt[] {
  switch (f.kind) {
    case 'material_lost':
    case 'missed_material': {
      const out: PieceAt[] = [];
      if (f.piece) out.push(f.piece);
      if (f.kind === 'material_lost' && f.defender) out.push(f.defender);
      const p = f.pattern;
      if (p?.kind === 'fork') out.push(p.by, ...p.targets);
      if (p?.kind === 'skewer') out.push(p.by, p.front, p.behind);
      if (p?.kind === 'discovered_attack') out.push(p.moved, p.attacker, p.target);
      if (p?.kind === 'double_check') out.push(...p.by);
      return out;
    }
    default:
      return [];
  }
}

export function buildSheet(
  m: MoveReview,
  opts: {
    level: Level;
    player: FactSheet['player'];
    /** Positions before and after the move: the only boards whose pieces may be named. */
    fenBefore: string;
    fenAfter: string;
    opening?: string;
    typicalMove?: FactSheet['typicalMove'];
  },
): { sheet: FactSheet; vocabulary: Vocabulary } {
  const ex: Explanation = m.explanation;
  const vocabulary: Vocabulary = {
    sans: new Set([stripSan(m.san)]),
    squares: new Set([m.uci.slice(0, 2), m.uci.slice(2, 4)]),
    pieces: new Set(),
    numbers: new Set([Math.round(m.assessment.winBefore), Math.round(m.assessment.winAfter)]),
    classification: m.assessment.classification,
  };
  addBoardPieces(opts.fenBefore, vocabulary.pieces);
  addBoardPieces(opts.fenAfter, vocabulary.pieces);
  for (const line of ex.lines) {
    for (const mv of line.moves) {
      vocabulary.sans.add(stripSan(mv.san));
      vocabulary.squares.add(mv.uci.slice(0, 2));
      vocabulary.squares.add(mv.uci.slice(2, 4));
    }
  }
  for (const f of m.facts) for (const p of factPieces(f)) addPiece(p, vocabulary);
  for (const f of m.facts) {
    if ('amount' in f) vocabulary.numbers.add(f.amount);
    if ('mateIn' in f) vocabulary.numbers.add(f.mateIn);
  }
  if (m.assessment.secondBestLoss !== undefined) vocabulary.numbers.add(Math.round(m.assessment.secondBestLoss));
  if (m.assessment.sacrifice) addPiece(m.assessment.sacrifice.piece, vocabulary);
  if (opts.typicalMove) {
    vocabulary.sans.add(stripSan(opts.typicalMove.san));
    vocabulary.numbers.add(Math.round(opts.typicalMove.share * 100));
  }

  const texts = [ex.summary, ...ex.details, ...(ex.better ? [`${t('pgn.better', { san: ex.better.san })} ${ex.better.text}`] : [])];
  const sheet: FactSheet = {
    level: opts.level,
    language: getLocale(),
    player: opts.player,
    move: {
      label: m.label,
      san: m.san,
      color: m.color,
      classification: m.assessment.classification,
      classLabel: classLabel(m.assessment.classification),
    },
    winBefore: Math.round(m.assessment.winBefore),
    winAfter: Math.round(m.assessment.winAfter),
    facts: texts.map((text, i) => ({ id: `F${i + 1}`, text })),
    lines: ex.lines.map((l, i) => ({ id: `L${i + 1}`, label: l.label, moves: formatLine(l.moves) })),
    context: { phase: m.phase, ...(opts.opening ? { opening: opts.opening } : {}) },
  };
  if (ex.better) sheet.best = { san: ex.better.san };
  else if (m.bestLine[0] && m.bestLine[0].san !== m.san) sheet.best = { san: m.bestLine[0].san };
  if (sheet.best) vocabulary.sans.add(stripSan(sheet.best.san));
  if (ex.lesson) sheet.lesson = ex.lesson;
  if (opts.typicalMove) sheet.typicalMove = opts.typicalMove;
  // Move numbers used in the lines.
  for (const l of sheet.lines) for (const n of l.moves.matchAll(/(\d+)\./g)) vocabulary.numbers.add(Number(n[1]));
  for (const n of m.label.matchAll(/(\d+)/g)) vocabulary.numbers.add(Number(n[1]));
  return { sheet, vocabulary };
}
