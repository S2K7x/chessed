import { afterAll, describe, expect, it } from 'vitest';
import type { Classification } from './classify';
import type { Evaluator } from './engine';
import { bareKingMate, endgameDrills, materialText, playEndgameMove, startEndgame, type EndgameDrill } from './endgame';
import type { UciScore } from './eval';
import { parseGame } from './pgn';
import type { GameReview, MoveReview } from './review';
import { evalOf } from './testing/fixtures';
import { createNodeEngine } from './testing/nodeEngine';

/** A review where every move is in the endgame, with the given winning chances of the mover. */
function reviewOf(pgn: string, wins: [number, number][]) {
  const game = parseGame(pgn);
  const moves = game.moves.map(
    (m, i) =>
      ({
        ply: m.ply,
        color: m.ply % 2 === 1 ? 'white' : 'black',
        san: m.san,
        uci: m.uci,
        phase: 'endgame',
        assessment: { classification: 'best' as Classification, winBefore: wins[i]![0], winAfter: wins[i]![1], winLoss: 0, reasons: [], confidence: 'high' },
        bestLine: [],
        facts: [],
      }) as unknown as MoveReview,
  );
  return { game, review: { moves } as unknown as GameReview };
}

const MOVES = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6';

describe('endgame drills', () => {
  it('finds the last winning position before the win slipped', () => {
    // White: 80, 85 (still winning), then 3. Bc4 drops to 50.
    const { game, review } = reviewOf(`[Result "1/2-1/2"]\n\n${MOVES} 1/2-1/2`, [
      [80, 85], [20, 15], [85, 84], [16, 15], [84, 50], [50, 50], [50, 50], [50, 50],
    ]);
    const drills = endgameDrills(game, review, 'white', 1);
    expect(drills).toHaveLength(1);
    // The drill starts before 3. Bc4, the move that let it slip (still 84% there).
    expect(drills[0]).toMatchObject({ goal: 'win', moveIndex: 4, playedSan: 'Bc4', id: `${game.id}:5`, fen: game.moves[4]!.fenBefore });
    // A game the player won is not a drill.
    const winGame = reviewOf(`[Result "1-0"]\n\n${MOVES} 1-0`, [
      [80, 85], [20, 15], [85, 84], [16, 15], [84, 50], [50, 50], [50, 50], [50, 50],
    ]);
    expect(endgameDrills(winGame.game, winGame.review, 'white')).toHaveLength(0);
  });

  it('finds a drawn endgame that was lost', () => {
    const { game, review } = reviewOf(`[Result "1-0"]\n\n${MOVES} 1-0`, [
      [50, 50], [50, 50], [50, 50], [50, 45], [50, 50], [45, 10], [90, 90], [10, 10],
    ]);
    expect(endgameDrills(game, review, 'black')).toMatchObject([{ goal: 'draw', moveIndex: 5, color: 'black' }]);
  });

  it('recognises a bare king against a queen or a rook', () => {
    expect(bareKingMate('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'white')).toBe('queen');
    expect(bareKingMate('8/8/8/4k3/8/8/8/3RK3 w - - 0 1', 'white')).toBe('rook');
    expect(bareKingMate('8/8/8/4k3/8/8/4P3/3RK3 w - - 0 1', 'black')).toBeUndefined();
    expect(bareKingMate('8/8/8/4k3/8/8/8/3BK3 w - - 0 1', 'white')).toBeUndefined();
  });

  it('describes the material', () => {
    expect(materialText('8/5k2/8/8/8/8/R4PPP/6K1 w - - 0 1', 'white')).toBe('R+3P vs K');
    expect(materialText('8/5kpp/8/8/8/8/R4PPP/1r4K1 b - - 0 1', 'black')).toBe('R+2P vs R+3P');
  });
});

const drill = (fen: string, goal: 'win' | 'draw', color: 'white' | 'black' = 'white'): EndgameDrill => ({
  id: 'g:1',
  gameId: 'g',
  moveIndex: 0,
  ply: 1,
  fen,
  color,
  goal,
  winBefore: 90,
  playedSan: 'Kg2',
  createdAt: 0,
  attempts: [],
});

/** Answers every position with the same score (side to move) and best move from a table. */
const scripted = (score: (fen: string) => UciScore, best: Record<string, string>): Evaluator => ({
  id: 'scripted',
  evaluate: async (fen) => evalOf(fen, [{ score: score(fen), pv: [best[fen.split(' ')[0]!] ?? ''] }]),
});

describe('endgame sessions', () => {
  it('fails a won position given away by stalemate, and shows the better move', async () => {
    const fen = '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1';
    const ev = scripted(() => ({ mate: 1 }), { '7k/8/5K2/8/8/8/8/6Q1': 'g1g7' });
    const s = await startEndgame(drill(fen, 'win'), ev, 10);
    const end = await playEndgameMove(s, 'g1g6', ev, 10);
    expect(end.status).toBe('failed');
    expect(end.message).toBe('Stalemate. The win is gone.');
    expect(end.better?.san).toBe('Qg7#');
  });

  it('fails when the winning chances drop, and holds a draw for long enough', async () => {
    const fen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
    const losing = scripted(() => ({ cp: 0 }), { '8/8/4k3/8/8/4K3/4P3/8': 'e3e4', '8/8/4k3/8/8/5K2/4P3/8': 'e6e5' });
    const s = await startEndgame(drill(fen, 'win'), losing, 10);
    const end = await playEndgameMove(s, 'e3f3', losing, 10);
    expect(end).toMatchObject({ status: 'failed', message: 'After Kf3 the position is no longer winning.' });
    expect(end.better?.san).toBe('Ke4');
    expect(end.reply?.san).toBe('Ke5');

    // The same position as a draw to hold: the engine (scripted) shuffles its king.
    let h = await startEndgame(drill(fen, 'draw'), scripted(() => ({ cp: 0 }), {}), 10);
    expect(h.status).toBe('your-move');
    const shuffle: Evaluator = {
      id: 'shuffle',
      evaluate: async (f) => evalOf(f, [{ score: { cp: 0 }, pv: [f.includes('4k3/8/8') ? 'e6d6' : 'd6e6'] }]),
    };
    const mine = ['e3d3', 'd3e3'];
    for (let i = 0; h.status === 'your-move' && i < 40; i++) h = await playEndgameMove(h, mine[i % 2]!, shuffle, 10);
    // Shuffling repeats the position: a draw by repetition, which holds.
    expect(h).toMatchObject({ status: 'success', message: 'The same position came up three times: a draw. You held the draw.' });
  });
});

describe('endgame sessions with Stockfish', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('converts king and queen against king', async () => {
    const s = await startEndgame(drill('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), engine, 12);
    const end = await playEndgameMove(s, 'd1d3', engine, 12);
    expect(end).toMatchObject({ status: 'success', message: 'Converted: queen against a bare king is a known mate.' });
  }, 30_000);
});
