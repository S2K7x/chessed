import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import openings from '../../data/openings.json';
import type { OpeningBook } from '../openings';
import { parseGame } from '../pgn';
import { analyseGame, localizeReview, type GameReview } from '../review';
import { registerCatalog, setLocale } from '../../i18n';
import { fr } from '../../i18n/fr';
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

describe('in French', () => {
  const inFrench = <T>(run: () => T): T => {
    registerCatalog('fr', fr);
    setLocale('fr');
    try {
      return run();
    } finally {
      setLocale('en');
    }
  };

  it('writes the stored review again in French, from the same facts', () => {
    const french = inFrench(() => localizeReview(review, game));
    const m = french.moves.find((x) => x.san === 'Bxd1')!;
    expect(french.locale).toBe('fr');
    expect(m.explanation.title).toContain('Gaffe');
    expect(m.explanation.summary).toMatch(/échec et mat forcé en 2/);
    expect(m.facts).toEqual(bxd1().facts);
    expect(m.explanation.lines.map((l) => l.moves.map((x) => x.san))).toEqual(bxd1().explanation.lines.map((l) => l.moves.map((x) => x.san)));
    expect(french.summary.white.join(' ')).not.toMatch(/winning chances/);
    // Back to English: the English texts come back.
    expect(localizeReview(french, game).moves.find((x) => x.san === 'Bxd1')!.explanation.summary).toBe(bxd1().explanation.summary);
  });

  const frenchCheck = (patch: Partial<CoachText>) =>
    inFrench(() => {
      const fm = localizeReview(review, game).moves.find((x) => x.san === 'Bxd1')!;
      const { sheet, vocabulary } = buildSheet(fm, { level: 'intermediate', player: 'you', ...fens });
      expect(sheet.language).toBe('fr');
      const text: CoachText = {
        headline: 'Prendre la dame mène au mat',
        explanation: `Bxd1 gagne la dame, mais permet un mat en 2 : 6. Bxf7+ Ke7 7. Nd5#. Vos chances de gain passent de ${sheet.winBefore} % à ${sheet.winAfter} %.`,
        why_better: 'dxe5 prend le cavalier en e5 et garde votre roi à l’abri.',
        lesson: 'Quand votre roi a peu de cases de fuite, vérifiez chaque échec adverse.',
        cited_facts: ['F1', 'F2'],
        ...patch,
      };
      return verifyCoachText(text, vocabulary, sheet.facts.map((f) => f.id));
    });

  it('accepts a French text built from the facts (same SAN moves and squares)', () => {
    expect(frenchCheck({}).problems).toEqual([]);
  });

  it('rejects French piece names placed on the wrong square', () => {
    expect(frenchCheck({ explanation: 'Votre cavalier en c6 est perdu.' }).problems.join()).toMatch(/knight on c6/);
  });

  it('rejects moves written with French piece letters', () => {
    expect(frenchCheck({ why_better: 'Cxe5 était meilleur.' }).problems.join()).toMatch(/French piece letters/);
  });

  it('rejects a wrong French percentage, mate length or classification word', () => {
    expect(frenchCheck({ explanation: 'Vos chances tombent à 55 %.' }).ok).toBe(false);
    expect(frenchCheck({ explanation: 'Cela permet un mat en 4.' }).ok).toBe(false);
    expect(frenchCheck({ headline: 'Un coup brillant' }).ok).toBe(false);
  });
});
