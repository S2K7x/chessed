import { describe, expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { EXAMPLE_PGN } from './exampleGame';
import { parseGame } from './pgn';

describe('example game', () => {
  it('parses into the 33 legal plies of the Opera Game, ending in mate', () => {
    const game = parseGame(EXAMPLE_PGN);
    expect(game.moves).toHaveLength(33);
    expect(game.white.name).toBe('Paul Morphy');
    const last = game.moves.at(-1)!;
    expect(last.san).toBe('Rd8#');
    const pos = Chess.fromSetup(parseFen(last.fenAfter).unwrap()).unwrap();
    expect(pos.isCheckmate()).toBe(true);
  });
});
