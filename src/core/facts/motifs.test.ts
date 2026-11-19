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

describe('mate patterns', () => {
  it('recognises a smothered mate', async () => {
    const { matePattern } = await import('./motifs');
    // The king on h8 is boxed in by its own rook and pawns: Nf7 mates.
    expect(matePattern(replayUci('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', ['g5f7']))).toBe('smothered');
    // The same knight check with a free square is no mate, so no pattern.
    expect(matePattern(replayUci('6rk/7p/8/6N1/8/8/8/6K1 w - - 0 1', ['g5f7']))).toBeUndefined();
  });

  it('recognises an Arabian mate', async () => {
    const { matePattern } = await import('./motifs');
    // Rh7 next to the cornered king, protected by the knight on f6, which also covers g8.
    expect(matePattern(replayUci('7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', ['a7h7']))).toBe('arabian');
  });

  it('leaves other mates unnamed', async () => {
    const { matePattern } = await import('./motifs');
    expect(matePattern(replayUci('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8']))).toBeUndefined();
    expect(matePattern(replayUci('8/8/8/8/8/5K2/7Q/5k2 w - - 0 1', ['h2f2']))).toBeUndefined();
  });
});

describe('mate patterns in facts', () => {
  it('names the mate a move allows', async () => {
    const { detectFacts } = await import('./index');
    const { evalOf } = await import('../testing/fixtures');
    // Black moves the bishop; Nf7 is then a smothered mate.
    const fenBefore = '6rk/6pp/8/6N1/8/8/8/b5K1 b - - 0 1';
    const [move] = replayUci(fenBefore, ['a1b2']);
    const facts = detectFacts({
      uci: 'a1b2',
      color: 'black',
      fenBefore,
      fenAfter: move!.fenAfter,
      before: evalOf(fenBefore, [{ score: { cp: 0 }, pv: ['g8f8'] }]),
      after: evalOf(move!.fenAfter, [{ score: { mate: 1 }, pv: ['g5f7'] }]),
    });
    expect(facts.find((f) => f.kind === 'mate_allowed')).toMatchObject({ mateIn: 1, backRank: false, pattern: 'smothered' });
  });
});
