import { describe, expect, it } from 'vitest';
import { replayUci } from './chess';
import type { Classification } from './classify';
import type { Color } from './eval';
import type { Fact } from './facts';
import type { Game } from './game';
import { computeProfile, tacticalOpportunity, type ProfileEntry } from './profile';
import type { GameReview, MoveReview } from './review';
import { evalOf } from './testing/fixtures';
import { dueExercises, exercisesFromReview, gradeAttempt, review as reviewExercise } from './training';
import { parseGame } from './pgn';
import { analyseGame } from './review';
import type { Evaluator } from './engine';

const FORK: Fact = {
  kind: 'material_lost',
  amount: 5,
  motif: 'fork',
  line: [],
};

/** A fake move review: only the fields the profile reads. */
function mv(ply: number, c: Classification, opts: { facts?: Fact[]; loss?: number; trouble?: boolean } = {}): MoveReview {
  const color: Color = ply % 2 === 1 ? 'white' : 'black';
  return {
    ply,
    color,
    san: 'a3',
    uci: 'a2a3',
    label: `${Math.ceil(ply / 2)}.`,
    phase: 'middlegame',
    assessment: { classification: c, winBefore: 50, winAfter: 50 - (opts.loss ?? 0), winLoss: opts.loss ?? 0, reasons: [], confidence: 'high' },
    bestLine: [],
    facts: opts.facts ?? [],
    explanation: { title: '', summary: '', details: [], lines: [], arrows: [], lesson: 'Look for forks.' },
    isKeyMoment: false,
    timeTrouble: opts.trouble ?? false,
    ...(opts.facts?.length ? { errorKind: 'tactical' as const } : {}),
  };
}

function entry(id: string, date: string, result: string, moves: MoveReview[], accuracy = 80): ProfileEntry {
  const game = { id, date, result, white: { name: 'me' }, black: { name: 'them' }, importedAt: 0, moves: [], startFen: '', pgn: '', source: 'pgn' } as unknown as Game;
  const review = {
    moves,
    evals: moves.map((m) => ({ fen: '', turn: m.color, lines: [], depth: 20, source: 'engine' })),
    accuracy: { white: accuracy, black: 70 },
    accuracyByPhase: { middlegame: { white: accuracy } },
    opening: { eco: 'C50', name: 'Italian Game', lastBookPly: 0 },
  } as unknown as GameReview;
  return { game, review, color: 'white' };
}

describe('computeProfile', () => {
  const games = [
    entry('a', '2026-01-01', '0-1', [mv(1, 'best'), mv(3, 'blunder', { facts: [FORK], loss: 40 }), mv(5, 'mistake', { facts: [FORK], loss: 15, trouble: true })], 60),
    entry('b', '2026-01-02', '1-0', [mv(1, 'best'), mv(3, 'blunder', { facts: [FORK], loss: 30 }), mv(5, 'best')], 70),
    entry('c', '2026-01-03', '1/2-1/2', [mv(1, 'best'), mv(3, 'good'), mv(5, 'best')], 85),
    entry('d', '2026-01-04', '1-0', [mv(1, 'best'), mv(3, 'best'), mv(5, 'excellent')], 90),
    entry('e', '2026-01-05', '1-0', [mv(1, 'best'), mv(3, 'good'), mv(5, 'best')], 88),
    entry('f', '2026-01-06', '1-0', [mv(1, 'best'), mv(3, 'best'), mv(5, 'best')], 92),
  ];
  const p = computeProfile(games);

  it('counts results, accuracy and errors', () => {
    expect(p.games).toBe(6);
    expect(p.results).toEqual({ wins: 4, draws: 1, losses: 1 });
    expect(p.moves).toBe(18);
    expect(p.errorsPer100).toBeCloseTo((100 * 3) / 18);
    expect(p.accuracy).toBeCloseTo((60 + 70 + 85 + 90 + 88 + 92) / 6);
    expect(p.accuracyTrend.map((x) => x.gameId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(p.timeTrouble).toMatchObject({ errors: 1, totalErrors: 3 });
  });

  it('rates themes per opportunity and picks priorities', () => {
    const forks = p.themes.find((t) => t.theme === 'forks');
    expect(forks).toMatchObject({ kind: 'allowed', errors: 3, opportunities: 18 });
    expect(forks!.avgCost).toBeCloseTo(85 / 3);
    expect(p.priorities[0]?.theme).toBe('forks');
  });

  it('sees errors that are no longer made', () => {
    expect(p.windows).toEqual({ previous: 3, recent: 3 });
    expect(p.improved.map((t) => t.theme)).toContain('forks');
  });

  it('groups openings from the player’s side', () => {
    expect(p.openings[0]).toMatchObject({ name: 'Italian Game', color: 'white', games: 6 });
    expect(p.openings[0]!.score).toBeCloseTo(4.5 / 6);
  });
});

describe('tacticalOpportunity', () => {
  it('recognises free material and mates', () => {
    const fen = 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3';
    const m = { ...mv(5, 'mistake'), bestLine: replayUci(fen, ['c3d5']) };
    expect(tacticalOpportunity(m, evalOf(fen, [{ score: { cp: 900 }, pv: ['c3d5'] }]))).toBe('free material');
    const mateFen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const mm = { ...mv(1, 'mistake'), bestLine: replayUci(mateFen, ['a1a8']) };
    expect(tacticalOpportunity(mm, evalOf(mateFen, [{ score: { mate: 1 }, pv: ['a1a8'] }]))).toBe('missed checkmates');
    const quiet = { ...mv(1, 'best'), bestLine: replayUci(mateFen, ['g1f1']) };
    expect(tacticalOpportunity(quiet, evalOf(mateFen, [{ score: { cp: 30 }, pv: ['g1f1'] }]))).toBeUndefined();
  });
});

describe('stored opportunities', () => {
  it('uses the opportunity stored at analysis time instead of replaying lines', () => {
    // No engine lines at all: only the stored value can name the tactic.
    const missed = { ...mv(1, 'mistake', { loss: 20 }), opportunity: 'forks' };
    const found = { ...mv(3, 'best'), opportunity: 'forks' };
    const none = { ...mv(5, 'best'), opportunity: null };
    const p = computeProfile([entry('s', '2026-02-01', '1-0', [missed, found, none])]);
    expect(p.themes.find((t) => t.theme === 'forks')).toMatchObject({ kind: 'missed', errors: 1, opportunities: 2 });
  });

  it('is filled in by the analysis', async () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const flat: Evaluator = {
      id: 'flat',
      evaluate: async (fen) => evalOf(fen, [{ score: { cp: 0 }, pv: [] }]),
    };
    const review = await analyseGame(game, flat, {}, { depth: 20, multiPv: 1 });
    expect(review.moves.every((m) => m.opportunity === null)).toBe(true);
  });
});

describe('training', () => {
  it('grades attempts', () => {
    expect(gradeAttempt({ solved: true, hints: 0, wrong: 0, seconds: 8 })).toBe('easy');
    expect(gradeAttempt({ solved: true, hints: 0, wrong: 0, seconds: 40 })).toBe('good');
    expect(gradeAttempt({ solved: true, hints: 1, wrong: 0, seconds: 40 })).toBe('hard');
    expect(gradeAttempt({ solved: false, hints: 0, wrong: 1, seconds: 40 })).toBe('again');
  });

  it('turns mistakes into cards and schedules them', async () => {
    const game = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    const moves = game.moves.map((m, i) => ({
      ...mv(m.ply, i === 5 ? 'blunder' : 'best'),
      san: m.san,
      uci: m.uci,
      bestLine: i === 5 ? replayUci(m.fenBefore, ['g7g6']) : [],
    }));
    const r = { moves } as unknown as GameReview;
    const now = new Date('2026-11-18T10:00:00Z');
    const [ex, ...rest] = await exercisesFromReview(game, r, 'black', now);
    expect(rest).toHaveLength(0);
    expect(ex).toMatchObject({ id: `${game.id}:6`, playedSan: 'Nf6', bestSan: 'g6', color: 'black' });
    expect(dueExercises([ex!], now.getTime())).toHaveLength(1);
    const next = await reviewExercise(ex!, 'good', 0, 0, now);
    expect(next.due).toBeGreaterThan(now.getTime() + 24 * 3600_000);
    expect(next.attempts).toHaveLength(1);
    const again = await reviewExercise(ex!, 'again', 0, 2, now);
    expect(again.due).toBeLessThan(next.due);
  });

  it('adds a blunder-check card when the mistake allowed a concrete punishment', async () => {
    const game = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    const punish = replayUci(game.moves[5]!.fenAfter, ['h5f7']);
    const moves = game.moves.map((m, i) => ({
      ...mv(m.ply, i === 5 ? 'blunder' : 'best', i === 5 ? { facts: [{ kind: 'mate_allowed', mateIn: 1, line: punish, backRank: false }] } : {}),
      san: m.san,
      uci: m.uci,
      bestLine: i === 5 ? replayUci(m.fenBefore, ['g7g6']) : [],
    }));
    const r = { moves } as unknown as GameReview;
    const cards = await exercisesFromReview(game, r, 'black', new Date('2026-11-18T10:00:00Z'));
    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({
      id: `${game.id}:6:threat`,
      kind: 'threat',
      fen: game.moves[5]!.fenAfter,
      color: 'white',
      bestSan: 'Qxf7#',
      playedSan: 'Nf6',
    });
    expect(cards[1]!.card).not.toBe(cards[0]!.card);
  });
});
