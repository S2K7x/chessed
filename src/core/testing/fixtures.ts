import { fromUciScore, type Color, type EngineLine, type PositionEval, type UciScore } from '../eval';

/** Builds a PositionEval from side-to-move scores, as an engine would report them. */
export function evalOf(fen: string, lines: { score: UciScore; pv: string[] }[], depth = 18): PositionEval {
  const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const engineLines: EngineLine[] = lines.map((l, i) => ({
    rank: i + 1,
    score: fromUciScore(l.score, turn),
    pv: l.pv,
    depth,
  }));
  return { fen, turn, lines: engineLines, depth, source: 'engine' };
}

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Legall's mate: 5...Bxd1?? allows mate in two. */
export const LEGALL_PGN = `[Event "Legall"]
[White "Legall"]
[Black "Saint Brie"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;
