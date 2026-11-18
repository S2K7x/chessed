import { describe, expect, it } from 'vitest';
import { replayUci } from '../chess';
import { positionalFacts } from './positional';

const themes = (fen: string, uci: string, ply = 40, bestUci?: string) => {
  const [m] = replayUci(fen, [uci]);
  const [best] = bestUci ? replayUci(fen, [bestUci]) : [];
  return positionalFacts(m!, m!.fenBefore.split(' ')[1] === 'w' ? 'white' : 'black', ply, best);
};

describe('positionalFacts', () => {
  it('finds a new isolated pawn', () => {
    const f = themes('4k3/8/8/8/8/2p5/PP6/4K3 w - - 0 1', 'b2c3');
    expect(f.find((x) => x.theme === 'isolated_pawn')?.squares).toContain('a2');
  });

  it('finds new doubled pawns', () => {
    const f = themes('4k3/8/8/8/8/2p5/2PP4/4K3 w - - 0 1', 'd2c3');
    expect(f.find((x) => x.theme === 'doubled_pawns')?.squares.sort()).toEqual(['c2', 'c3']);
  });

  it('finds a passed pawn conceded to the opponent', () => {
    const f = themes('4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1', 'd4d5');
    expect(f.find((x) => x.theme === 'passed_pawn_allowed')?.squares).toEqual(['e5']);
  });

  it('finds a weakened king shelter', () => {
    const f = themes('4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1', 'g2g4');
    expect(f.map((x) => x.theme)).toContain('king_shelter');
  });

  it('finds a knight on the rim', () => {
    expect(themes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'b1a3', 1).map((x) => x.theme)).toContain('knight_rim');
  });

  it('finds an early queen move and the developing alternative', () => {
    const f = themes('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'd1h5', 3, 'g1f3');
    expect(f.find((x) => x.theme === 'early_queen')).toMatchObject({ bestDevelops: 'Nf3' });
  });

  it('reports nothing for a normal developing move', () => {
    expect(themes('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'g1f3', 3)).toEqual([]);
  });
});
