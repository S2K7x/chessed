import { describe, expect, it } from 'vitest';
import { parseGame, parseGames, PgnError } from './pgn';
import { LEGALL_PGN } from './testing/fixtures';

describe('PGN parsing', () => {
  it('reads headers, moves and the speed class', () => {
    const g = parseGame(LEGALL_PGN);
    expect(g.white.name).toBe('Legall');
    expect(g.black.name).toBe('Saint Brie');
    expect(g.result).toBe('1-0');
    expect(g.moves).toHaveLength(13);
    expect(g.moves[0]).toMatchObject({ ply: 1, color: 'white', san: 'e4', uci: 'e2e4' });
    expect(g.moves[9]).toMatchObject({ ply: 10, color: 'black', san: 'Bxd1' });
    expect(g.moves[12]?.san).toBe('Nd5#');
    expect(g.timeControl?.speed).toBe('blitz');
  });

  it('reads clocks, Elo and dates', () => {
    const g = parseGame(`[White "a"]\n[Black "b"]\n[WhiteElo "1500"]\n[BlackElo "1620"]\n[UTCDate "2026.11.18"]\n[TimeControl "60+0"]\n\n1. e4 { [%clk 0:00:59.5] } e5 { [%clk 0:01:00] } *`);
    expect(g.moves[0]?.clockMs).toBe(59500);
    expect(g.moves[1]?.clockMs).toBe(60000);
    expect(g.white.elo).toBe(1500);
    expect(g.black.elo).toBe(1620);
    expect(g.date).toBe('2026-11-18');
    expect(g.timeControl?.speed).toBe('bullet');
  });

  it('accepts games from a position with Black to move', () => {
    const g = parseGame('[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1"]\n[SetUp "1"]\n\n1... Kd7 2. e4 *');
    expect(g.moves[0]).toMatchObject({ ply: 2, color: 'black', san: 'Kd7' });
  });

  it('reports the illegal move', () => {
    expect(() => parseGame('1. e4 e5 2. Ke3 *')).toThrow(PgnError);
    expect(() => parseGame('1. e4 e5 2. Ke3 *')).toThrow(/2\. Ke3/);
  });

  it('reads several games from one file', () => {
    expect(parseGames(`${LEGALL_PGN}\n\n${LEGALL_PGN.replace('Legall', 'Other')}`)).toHaveLength(2);
  });

  it('gives the same id to the same game', () => {
    expect(parseGame(LEGALL_PGN).id).toBe(parseGame(LEGALL_PGN).id);
  });
});

describe('typed moves', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('reads SAN, UCI and common typing variants', async () => {
    const { typedMove } = await import('./chess');
    expect(typedMove(start, 'Nf3')).toBe('g1f3');
    expect(typedMove(start, 'nf3')).toBe('g1f3');
    expect(typedMove(start, 'e4')).toBe('e2e4');
    expect(typedMove(start, 'E2E4')).toBe('e2e4');
    expect(typedMove(start, ' d4+ ')).toBe('d2d4');
    expect(typedMove(start, 'Nf6')).toBeUndefined();
    expect(typedMove(start, 'hello')).toBeUndefined();
    const castle = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(typedMove(castle, 'O-O')).toBeDefined();
    expect(typedMove(castle, '0-0-0')).toBe(typedMove(castle, 'O-O-O'));
    // "b" stays a pawn capture, not a bishop.
    const pawn = 'rnbqkbnr/pppppppp/8/8/2p5/1P6/P1PPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(typedMove(pawn, 'bxc4')).toBe('b3c4');
  });
});
