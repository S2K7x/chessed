import { afterAll, describe, expect, it } from 'vitest';
import { replayUci } from './chess';
import { classifyMove } from './classify';
import { formatLine } from './explain';
import { detectFacts } from './facts';
import openings from '../data/openings.json';
import type { OpeningBook } from './openings';
import { parseGame } from './pgn';
import { analyseGame } from './review';
import { createNodeEngine } from './testing/nodeEngine';
import { LEGALL_PGN } from './testing/fixtures';

const engine = createNodeEngine();
afterAll(() => engine.dispose());
const book = openings as unknown as OpeningBook;

async function factsFor(fen: string, uci: string) {
  const [move] = replayUci(fen, [uci]);
  if (!move) throw new Error('illegal test move');
  const before = await engine.evaluate(fen, { depth: 14, multiPv: 2 });
  const after = await engine.evaluate(move.fenAfter, { depth: 14, multiPv: 2 });
  const color = before.turn;
  const assessment = classifyMove({ uci, color, before, after, legalMoves: 20, inBook: false });
  const facts = detectFacts({ uci, color, fenBefore: fen, fenAfter: move.fenAfter, before, after });
  return { assessment, facts };
}

describe('Stockfish integration', () => {
  it('reports scores from White’s point of view whoever is to move', async () => {
    // Black to move and a queen up: White's score must be very negative.
    const e = await engine.evaluate('4k3/8/8/8/8/3q4/8/4K3 b - - 0 1', { depth: 10, multiPv: 1 });
    expect(e.turn).toBe('black');
    const s = e.lines[0]!.score;
    expect(s.mate !== undefined ? s.mate < 0 : s.cp! < -500).toBe(true);
  });

  it('rejects illegal positions instead of crashing the engine', async () => {
    await expect(engine.evaluate('4k3/8/8/8/8/8/3q4/4K3 b - - 0 1', { depth: 5, multiPv: 1 })).rejects.toThrow(/invalid position/);
    const ok = await engine.evaluate('4k3/8/8/8/8/3q4/8/4K3 b - - 0 1', { depth: 5, multiPv: 1 });
    expect(ok.lines.length).toBe(1);
  });

  it('detects a queen moved to an attacked square', async () => {
    // 1. e4 Nf6 2. Qh5?? Nxh5
    const { assessment, facts } = await factsFor('rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2', 'd1h5');
    expect(assessment.classification).toBe('blunder');
    expect(facts[0]).toMatchObject({ kind: 'material_lost', motif: 'moved_piece_unsafe', piece: { role: 'queen', square: 'h5' } });
  });

  it('detects an allowed knight fork', async () => {
    const { assessment, facts } = await factsFor('r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1', 'h7h6');
    expect(['mistake', 'blunder']).toContain(assessment.classification);
    const f = facts.find((x) => x.kind === 'material_lost');
    expect(f).toMatchObject({ motif: 'fork' });
    if (f?.kind === 'material_lost') {
      expect(f.line[0]?.san).toBe('Nc7+');
      expect(f.fork?.targets.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
    }
  });

  it('detects a missed free capture', async () => {
    const { facts } = await factsFor('rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3', 'a2a3');
    expect(facts.find((f) => f.kind === 'missed_material')).toMatchObject({ motif: 'free_capture', piece: { role: 'queen', square: 'd5' } });
  });

  it('detects a missed mate', async () => {
    const { facts } = await factsFor('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a2');
    const f = facts.find((x) => x.kind === 'mate_missed');
    expect(f).toMatchObject({ mateIn: 1 });
    if (f?.kind === 'mate_missed') expect(formatLine(f.line)).toBe('1. Ra8#');
  });

  it('reviews a full game: Legall’s mate', async () => {
    const game = parseGame(LEGALL_PGN);
    const review = await analyseGame(game, engine, book, { depth: 14, multiPv: 2 });
    const byPly = (p: number) => review.moves.find((m) => m.ply === p)!;

    expect(review.evals).toHaveLength(14);
    expect(review.evals[13]?.terminal).toBe('checkmate');
    expect(review.whiteWins[13]).toBe(100);

    expect(byPly(1).assessment.classification).toBe('book');
    expect(review.opening?.name).toBeTruthy();

    const bxd1 = byPly(10);
    expect(bxd1.san).toBe('Bxd1');
    expect(bxd1.assessment.classification).toBe('blunder');
    expect(bxd1.assessment.reasons).toContain('allowed_mate');
    expect(bxd1.facts[0]).toMatchObject({ kind: 'mate_allowed', mateIn: 2 });
    expect(bxd1.explanation.summary).toContain('checkmate in 2');
    expect(bxd1.errorKind).toBe('tactical');
    expect(bxd1.isKeyMoment).toBe(true);

    expect(byPly(13).san).toBe('Nd5#');
    expect(['best', 'great']).toContain(byPly(13).assessment.classification);
    expect(review.accuracy.white).toBeGreaterThan(review.accuracy.black!);

    // Every line shown to the user is legal from its starting position.
    for (const m of review.moves) {
      for (const line of m.explanation.lines) {
        expect(replayUci(line.fen, line.moves.map((x) => x.uci))).toHaveLength(line.moves.length);
      }
    }
  });
});
