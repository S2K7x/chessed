import { describe, expect, it } from 'vitest';
import { parseGame } from '../pgn';
import { findSacrifice } from './sacrifice';

/** Position before the last move of a PGN, and that move. */
function lastMove(pgn: string) {
  const g = parseGame(pgn);
  const m = g.moves[g.moves.length - 1]!;
  return { fen: m.fenBefore, uci: m.uci };
}

describe('findSacrifice', () => {
  it("finds Legall's queen sacrifice (5. Nxe5)", () => {
    const { fen, uci } = lastMove('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 *');
    expect(findSacrifice(fen, uci)).toMatchObject({ piece: { role: 'queen', square: 'd1' }, investment: 5 });
  });

  it('finds the Greek gift (Bxh7+)', () => {
    const { fen, uci } = lastMove('1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. Nf3 Be7 6. Bd3 O-O 7. Bxh7+ *');
    expect(findSacrifice(fen, uci)).toMatchObject({ piece: { role: 'bishop', square: 'h7' }, investment: 2 });
  });

  it('ignores an even trade', () => {
    const { fen, uci } = lastMove('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 *');
    expect(findSacrifice(fen, uci)).toBeUndefined();
  });

  it('ignores a piece that was already hanging before the move', () => {
    // Black's knight on e5 is attacked by the d4 pawn; a6 does not create that offer.
    const { fen, uci } = lastMove('1. d4 Nc6 2. c3 Ne5 3. Nd2 a6 *');
    expect(findSacrifice(fen, uci)).toBeUndefined();
  });

  it('ignores pawn offers', () => {
    const { fen, uci } = lastMove('1. e4 d5 *');
    expect(findSacrifice(fen, uci)).toBeUndefined();
  });

  it('ignores an offer the mover wins straight back', () => {
    // Bd5 can be taken by exd5, but that opens the e-file: Rxe7+ wins the queen back.
    const { fen, uci } = lastMove('[FEN "4k3/4q3/4p3/8/2B5/8/8/4RK2 w - - 0 1"]\n[SetUp "1"]\n\n1. Bd5 *');
    expect(findSacrifice(fen, uci)).toBeUndefined();
    // Without the rook, the same move is a real offer.
    const plain = lastMove('[FEN "4k3/4q3/4p3/8/2B5/8/8/5K2 w - - 0 1"]\n[SetUp "1"]\n\n1. Bd5 *');
    expect(findSacrifice(plain.fen, plain.uci)).toMatchObject({ piece: { role: 'bishop', square: 'd5' } });
  });
});
