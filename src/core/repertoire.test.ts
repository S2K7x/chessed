import { describe, expect, it } from 'vitest';
import { explore, ExplorerAuthError, ratingGroupsFor } from './explorer';
import { parseGame } from './pgn';
import { buildRepertoire, inconsistencies, myChoicesAt } from './repertoire';

const g = (pgn: string) => parseGame(pgn);
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

describe('repertoire', () => {
  const games = [
    { game: g('[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'), color: 'white' as const },
    { game: g('[Result "0-1"]\n\n1. e4 e5 2. Nf3 d6 0-1'), color: 'white' as const },
    { game: g('[Result "1/2-1/2"]\n\n1. e4 e5 2. Bc4 Nf6 1/2-1/2'), color: 'white' as const },
    { game: g('[Result "0-1"]\n\n1. d4 e5 0-1'), color: 'black' as const },
  ];
  const rep = buildRepertoire(games);

  it('records the player’s choices and scores by position', () => {
    const choices = myChoicesAt(rep, AFTER_E4_E5);
    expect(choices.map((c) => [c.san, c.count])).toEqual([['Nf3', 2], ['Bc4', 1]]);
    expect(choices[0]!.score).toBeCloseTo(0.5);
    expect(choices[1]!.score).toBeCloseTo(0.5);
  });

  it('only records the player’s own moves', () => {
    expect(myChoicesAt(rep, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toEqual([]);
    const black = myChoicesAt(rep, 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
    expect(black).toMatchObject([{ san: 'e5', count: 1, score: 1 }]);
  });

  it('can leave out the game being reviewed', () => {
    const id = games[0]!.game.id;
    expect(myChoicesAt(rep, AFTER_E4_E5, id).find((c) => c.san === 'Nf3')?.count).toBe(1);
  });

  it('finds positions where the player varies', () => {
    const first = inconsistencies(rep)[0];
    expect(first?.moves.map((m) => m.san)).toEqual(['Nf3', 'Bc4']);
    expect(first?.line).toBe('1. e4 e5');
  });
});

describe('opening explorer', () => {
  it('maps a rating to its group and the one above', () => {
    expect(ratingGroupsFor(1450)).toEqual([1400, 1600]);
    expect(ratingGroupsFor(800)).toEqual([0, 1000]);
    expect(ratingGroupsFor(2700)).toEqual([2500]);
  });

  it('reads moves and sends the token', async () => {
    let auth = '';
    let url = '';
    const r = await explore(
      async (u, init) => {
        url = u;
        auth = (init?.headers as Record<string, string>).Authorization!;
        return new Response(JSON.stringify({ white: 6, draws: 2, black: 2, opening: { eco: 'C20', name: "King's Pawn Game" }, moves: [{ uci: 'g1f3', san: 'Nf3', white: 5, draws: 1, black: 1, averageRating: 1650 }] }));
      },
      'tok',
      'lichess',
      AFTER_E4_E5,
      { ratings: [1400, 1600] },
    );
    expect(auth).toBe('Bearer tok');
    expect(url).toContain('ratings=1400%2C1600');
    expect(r.total).toBe(10);
    expect(r.moves[0]).toMatchObject({ san: 'Nf3', total: 7 });
    expect(r.opening?.eco).toBe('C20');
  });

  it('asks to log in on 401', async () => {
    await expect(explore(async () => new Response('', { status: 401 }), '', 'masters', AFTER_E4_E5)).rejects.toThrow(ExplorerAuthError);
  });
});
