import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import openings from '../../data/openings.json';
import type { OpeningBook } from '../openings';
import { parseGame } from '../pgn';
import { analyseGame, type GameReview } from '../review';
import { createNodeEngine } from '../testing/nodeEngine';
import { LEGALL_PGN } from '../testing/fixtures';
import { buildSheet, levelFromElo } from './sheet';
import { verifyCoachText, type CoachText } from './verify';

const engine = createNodeEngine();
let review: GameReview;
beforeAll(async () => {
  review = await analyseGame(parseGame(LEGALL_PGN), engine, openings as unknown as OpeningBook, { depth: 12, multiPv: 2 });
}, 120_000);
afterAll(() => engine.dispose());

const bxd1 = () => review.moves.find((m) => m.san === 'Bxd1')!;
const game = parseGame(LEGALL_PGN);
const fens = { fenBefore: game.moves[9]!.fenBefore, fenAfter: game.moves[9]!.fenAfter };

const faithful: CoachText = {
  headline: 'Taking the queen walks into mate',
  explanation:
    'Bxd1 wins the queen, but it allows a forced mate in 2: 6. Bxf7+ Ke7 7. Nd5#. Your winning chances fall from about 37% to 2%.',
  why_better: 'dxe5 takes the knight on e5 and keeps your king safe.',
  lesson: 'When your king has few escape squares, check every enemy check before you move.',
  cited_facts: ['F1', 'F2'],
};

describe('fact sheet', () => {
  it('carries verified sentences, lines and the allowed vocabulary', () => {
    const { sheet, vocabulary } = buildSheet(bxd1(), { level: 'beginner', player: 'you', ...fens });
    expect(sheet.move).toMatchObject({ san: 'Bxd1', classification: 'blunder' });
    expect(sheet.facts[0]!.text).toContain('checkmate in 2');
    expect(sheet.lines[0]!.moves).toContain('Nd5#');
    expect(vocabulary.sans.has('Bxf7')).toBe(true);
    expect(vocabulary.squares.has('d5')).toBe(true);
    expect(vocabulary.pieces.has('knight e5')).toBe(true);
  });

  it('maps ratings to levels', () => {
    expect(levelFromElo(900)).toBe('beginner');
    expect(levelFromElo(1500)).toBe('intermediate');
    expect(levelFromElo(2100)).toBe('advanced');
    expect(levelFromElo(undefined)).toBe('intermediate');
  });
});

describe('verifyCoachText', () => {
  const check = (patch: Partial<CoachText>) => {
    const { sheet, vocabulary } = buildSheet(bxd1(), { level: 'intermediate', player: 'you', ...fens });
    const t = { ...faithful, explanation: faithful.explanation.replace('37%', `${sheet.winBefore}%`), ...patch };
    return verifyCoachText(t, vocabulary, sheet.facts.map((f) => f.id));
  };

  it('accepts a text that only uses the facts', () => {
    const v = check({});
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('rejects an invented move', () => {
    expect(check({ why_better: 'Qh5 would have won.' }).problems.join()).toMatch(/Qh5/);
  });

  it('rejects an invented square', () => {
    expect(check({ explanation: 'The h3 square is weak.' }).ok).toBe(false);
  });

  it('rejects a piece that is not where the text says', () => {
    expect(check({ explanation: 'Your knight on c6 is lost.' }).problems.join()).toMatch(/knight on c6/);
  });

  it('rejects a wrong percentage or mate length', () => {
    expect(check({ explanation: 'Your chances drop to 55%.' }).ok).toBe(false);
    expect(check({ explanation: 'This allows mate in 4.' }).ok).toBe(false);
  });

  it('rejects a headline that contradicts the classification', () => {
    expect(check({ headline: 'A brilliant idea' }).ok).toBe(false);
  });

  it('rejects unknown or missing fact citations', () => {
    expect(check({ cited_facts: ['F99'] }).ok).toBe(false);
    expect(check({ cited_facts: [] }).ok).toBe(false);
  });
});
