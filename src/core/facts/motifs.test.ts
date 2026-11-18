import { describe, expect, it } from 'vitest';
import { replayUci, positionFromFen, squareIndex } from '../chess';
import { isBackRankMate, isPinnedToKing, motifOf } from './motifs';

const move = (fen: string, uci: string) => {
  const [m] = replayUci(fen, [uci]);
  if (!m) throw new Error(`illegal ${uci}`);
  return m;
};

describe('motifOf', () => {
  it('finds a knight fork', () => {
    const m = motifOf(move('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7'));
    expect(m?.kind).toBe('fork');
    if (m?.kind === 'fork') expect(m.targets.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
  });

  it('finds a skewer of king and queen', () => {
    const m = motifOf(move('q7/8/8/k7/7R/8/8/4K3 w - - 0 1', 'h4a4'));
    expect(m).toMatchObject({ kind: 'skewer', front: { role: 'king', square: 'a5' }, behind: { role: 'queen', square: 'a8' } });
  });

  it('finds a discovered attack', () => {
    const m = motifOf(move('4k3/6r1/8/8/3N4/8/1B6/4K3 w - - 0 1', 'd4b5'));
    expect(m).toMatchObject({ kind: 'discovered_attack', attacker: { role: 'bishop', square: 'b2' }, target: { role: 'rook', square: 'g7' } });
  });

  it('finds a double check', () => {
    const m = motifOf(move('4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1', 'e4f6'));
    expect(m?.kind).toBe('double_check');
  });

  it('reports nothing for a quiet move', () => {
    expect(motifOf(move('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4'))).toBeUndefined();
  });
});

describe('pins and back-rank mates', () => {
  it('detects a piece pinned to its king', () => {
    expect(isPinnedToKing(positionFromFen('4k3/4n3/8/8/8/8/8/4RK2 w - - 0 1').board, squareIndex('e7'))).toBe(true);
    expect(isPinnedToKing(positionFromFen('4k3/4n3/8/8/8/8/8/3R1K2 w - - 0 1').board, squareIndex('e7'))).toBe(false);
  });

  it('recognises a back-rank mate', () => {
    expect(isBackRankMate(replayUci('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8']))).toBe(true);
    // Mate in the middle of the board is not a back-rank mate.
    expect(isBackRankMate(replayUci('8/8/8/8/8/5K2/7Q/5k2 w - - 0 1', ['h2f2']))).toBe(false);
  });
});
