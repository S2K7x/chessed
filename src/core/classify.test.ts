import { describe, expect, it } from 'vitest';
import { classifyMove, type MoveContext } from './classify';
import { evalOf, START } from './testing/fixtures';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_F6 = 'rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

function white(over: Partial<MoveContext> & Pick<MoveContext, 'before' | 'after' | 'uci'>): MoveContext {
  return { color: 'white', legalMoves: 20, inBook: false, ...over };
}

describe('classifyMove — White', () => {
  const before = evalOf(START, [
    { score: { cp: 30 }, pv: ['e2e4', 'e7e5'] },
    { score: { cp: 20 }, pv: ['d2d4', 'd7d5'] },
  ]);

  it("labels the engine's top move Best", () => {
    const a = classifyMove(white({ uci: 'e2e4', before, after: evalOf(AFTER_E4, [{ score: { cp: -25 }, pv: ['e7e5'] }]) }));
    expect(a.classification).toBe('best');
    expect(a.winLoss).toBe(0);
    expect(a.reasons).toContain('engine_top_move');
  });

  it('uses the same search for a second MultiPV line', () => {
    const a = classifyMove(white({ uci: 'd2d4', before, after: evalOf(START.replace(' w ', ' b '), [{ score: { cp: 0 }, pv: ['d7d5'] }]) }));
    expect(a.winLoss).toBeGreaterThan(0.5);
    expect(a.winLoss).toBeLessThan(2);
    expect(a.classification).toBe('excellent');
  });

  it('labels a large loss a Blunder', () => {
    const a = classifyMove(white({ uci: 'g2g4', before, after: evalOf(AFTER_E4, [{ score: { cp: 300 }, pv: ['d7d5'] }]) }));
    expect(a.winAfter).toBeLessThan(30);
    expect(a.classification).toBe('blunder');
  });

  it('labels a single legal move Forced', () => {
    const a = classifyMove(white({ uci: 'g2g4', legalMoves: 1, before, after: evalOf(AFTER_E4, [{ score: { cp: 300 }, pv: ['d7d5'] }]) }));
    expect(a.classification).toBe('forced');
  });

  it('labels book moves Book unless they lose more than 5%', () => {
    const ok = classifyMove(white({ uci: 'e2e4', inBook: true, before, after: evalOf(AFTER_E4, [{ score: { cp: -25 }, pv: ['e7e5'] }]) }));
    expect(ok.classification).toBe('book');
    const bad = classifyMove(white({ uci: 'g2g4', inBook: true, before, after: evalOf(AFTER_E4, [{ score: { cp: 300 }, pv: ['d7d5'] }]) }));
    expect(bad.classification).toBe('blunder');
  });

  it('labels the only good move Great', () => {
    const sharp = evalOf(START, [
      { score: { cp: 100 }, pv: ['e2e4'] },
      { score: { cp: -150 }, pv: ['d2d4'] },
    ]);
    const after = evalOf(AFTER_E4, [{ score: { cp: -100 }, pv: ['e7e5'] }]);
    expect(classifyMove(white({ uci: 'e2e4', before: sharp, after })).classification).toBe('great');
    expect(classifyMove(white({ uci: 'e2e4', before: sharp, after, isRecapture: true })).classification).toBe('best');
  });

  it('does not award Great when the engine is not confident', () => {
    const shallow = evalOf(START, [{ score: { cp: 100 }, pv: ['e2e4'] }, { score: { cp: -150 }, pv: ['d2d4'] }], 6);
    const a = classifyMove(white({ uci: 'e2e4', before: shallow, after: evalOf(AFTER_E4, [{ score: { cp: -100 }, pv: ['e7e5'] }]) }));
    expect(a.classification).toBe('best');
    expect(a.confidence).toBe('low');
  });

  it('labels a failure to punish an opponent mistake a Miss', () => {
    const winning = evalOf(START, [{ score: { cp: 400 }, pv: ['e2e4'] }]);
    const a = classifyMove(
      white({ uci: 'a2a3', before: winning, after: evalOf(AFTER_E4, [{ score: { cp: -150 }, pv: ['e7e5'] }]), previousOpponentClass: 'blunder' }),
    );
    expect(a.classification).toBe('miss');
    expect(a.reasons).toContain('missed_punishment');
  });
});

describe('classifyMove — Black (sign handling)', () => {
  const before = evalOf(AFTER_E4, [
    { score: { cp: -30 }, pv: ['e7e5'] },
    { score: { cp: -40 }, pv: ['c7c5'] },
  ]);

  it('measures the loss from Black’s point of view', () => {
    // After 1...f6 White (to move) is +2.00: bad for Black.
    const a = classifyMove({ uci: 'f7f6', color: 'black', legalMoves: 20, inBook: false, before, after: evalOf(AFTER_E4_F6, [{ score: { cp: 200 }, pv: ['d2d4'] }]) });
    expect(a.winBefore).toBeLessThan(50);
    expect(a.winAfter).toBeLessThan(a.winBefore);
    expect(a.classification).toBe('mistake');
  });

  it('does not punish Black for a move that is good for Black', () => {
    const a = classifyMove({ uci: 'f7f6', color: 'black', legalMoves: 20, inBook: false, before, after: evalOf(AFTER_E4_F6, [{ score: { cp: -60 }, pv: ['d2d4'] }]) });
    expect(a.winLoss).toBe(0);
    expect(a.classification).toBe('best');
  });
});

describe('classifyMove — mates', () => {
  const mating = evalOf(START, [{ score: { mate: 2 }, pv: ['e2e4'] }, { score: { mate: 4 }, pv: ['d2d4'] }]);

  it('never penalises a slower forced mate', () => {
    const a = classifyMove(white({ uci: 'd2d4', before: mating, after: evalOf(AFTER_E4, [{ score: { mate: -4 }, pv: ['e7e5'] }]) }));
    expect(a.classification).toBe('excellent');
    expect(a.reasons).toContain('still_mating');
  });

  it('labels a delivered checkmate Best', () => {
    const after = { fen: AFTER_E4, turn: 'black' as const, terminal: 'checkmate' as const, lines: [], depth: 0, source: 'rules' as const };
    expect(classifyMove(white({ uci: 'h2h4', before: mating, after })).classification).toBe('best');
  });

  it('flags a lost forced mate', () => {
    const a = classifyMove(white({ uci: 'a2a3', before: mating, after: evalOf(AFTER_E4, [{ score: { cp: -300 }, pv: ['e7e5'] }]) }));
    expect(a.reasons).toContain('missed_mate');
    expect(a.classification).toBe('blunder');
  });

  it('caps a lost mate at Inaccuracy when still clearly winning', () => {
    const a = classifyMove(white({ uci: 'a2a3', before: mating, after: evalOf(AFTER_E4, [{ score: { cp: -800 }, pv: ['e7e5'] }]) }));
    expect(a.reasons).toContain('lost_forced_mate_still_winning');
    expect(['best', 'excellent', 'good', 'inaccuracy']).toContain(a.classification);
  });

  it('flags a move that allows mate', () => {
    const before = evalOf(START, [{ score: { cp: 0 }, pv: ['e2e4'] }]);
    const a = classifyMove(white({ uci: 'f2f3', before, after: evalOf(AFTER_E4, [{ score: { mate: 2 }, pv: ['e7e5'] }]) }));
    expect(a.reasons).toContain('allowed_mate');
    expect(a.classification).toBe('blunder');
  });

  it('does not call a move in a decided position an error', () => {
    const won = evalOf(START, [{ score: { cp: 1500 }, pv: ['e2e4'] }]);
    const a = classifyMove(white({ uci: 'a2a3', before: won, after: evalOf(AFTER_E4, [{ score: { cp: -1100 }, pv: ['e7e5'] }]) }));
    expect(['best', 'excellent']).toContain(a.classification);
  });
});

describe('classifyMove — Brilliant', () => {
  const sacrifice = { piece: { role: 'queen' as const, color: 'white' as const, square: 'd1' }, investment: 5 };
  const after = evalOf(AFTER_E4, [{ score: { cp: -150 }, pv: ['e7e5'] }]);

  it('needs a verified sacrifice that keeps the position sound', () => {
    const before = evalOf(START, [{ score: { cp: 150 }, pv: ['e2e4'] }, { score: { cp: 60 }, pv: ['d2d4'] }]);
    const a = classifyMove(white({ uci: 'e2e4', before, after, sacrifice }));
    expect(a.classification).toBe('brilliant');
    expect(a.reasons).toContain('sound_sacrifice');
    expect(classifyMove(white({ uci: 'e2e4', before, after })).classification).toBe('best');
  });

  it('is not given when the alternative was already completely winning', () => {
    const before = evalOf(START, [{ score: { cp: 900 }, pv: ['e2e4'] }, { score: { cp: 700 }, pv: ['d2d4'] }]);
    const a = classifyMove(white({ uci: 'e2e4', before, after: evalOf(AFTER_E4, [{ score: { cp: -900 }, pv: ['e7e5'] }]), sacrifice }));
    expect(a.classification).not.toBe('brilliant');
  });

  it('is not given when the sacrifice leaves a bad position', () => {
    const before = evalOf(START, [{ score: { cp: -150 }, pv: ['e2e4'] }, { score: { cp: -400 }, pv: ['d2d4'] }]);
    const a = classifyMove(white({ uci: 'e2e4', before, after: evalOf(AFTER_E4, [{ score: { cp: 150 }, pv: ['e7e5'] }]), sacrifice }));
    expect(a.classification).not.toBe('brilliant');
  });

  it('is not given for a clear loss of material', () => {
    const before = evalOf(START, [{ score: { cp: 150 }, pv: ['e2e4'] }, { score: { cp: 60 }, pv: ['d2d4'] }]);
    const a = classifyMove(white({ uci: 'g2g4', before, after: evalOf(AFTER_E4, [{ score: { cp: 200 }, pv: ['e7e5'] }]), sacrifice }));
    expect(a.classification).toBe('blunder');
  });
});
