import { describe, expect, it } from 'vitest';
import { parsePgn, parseComment, startingPosition, type ChildNode, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import type { Position } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import openings from '../data/openings.json';
import { annotatedPgn } from './annotate';
import { positionFromFen, replayUci } from './chess';
import type { Evaluator } from './engine';
import { whiteCp } from './eval';
import type { OpeningBook } from './openings';
import { parseGame } from './pgn';
import { analyseGame } from './review';

const flat: Evaluator = {
  id: 'flat',
  async evaluate(fen) {
    const pos = positionFromFen(fen);
    const [from, dests] = [...chessgroundDests(pos)][0]!;
    return { fen, turn: pos.turn, lines: [{ rank: 1, score: whiteCp(20), pv: [`${from}${dests[0]}`], depth: 20 }], depth: 20, source: 'engine' };
  },
};

/** Every move of the tree (main line and variations) must be legal. */
function allLegal(pos: Position, nodes: ChildNode<PgnNodeData>[]): boolean {
  return nodes.every((n) => {
    const move = parseSan(pos, n.data.san);
    if (!move) return false;
    const next = pos.clone();
    next.play(move);
    return allLegal(next, n.children);
  });
}

describe('annotated PGN', () => {
  it('round-trips with NAGs, evals and legal variations', async () => {
    const game = parseGame('[White "A"]\n[Black "B"]\n[Date "2026.11.18"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    const review = await analyseGame(game, flat, openings as unknown as OpeningBook, { depth: 20, multiPv: 1 });
    // Mark 3...Nf6 as a blunder with g6 as the better line.
    const nf6 = review.moves[5]!;
    nf6.assessment = { ...nf6.assessment, classification: 'blunder' };
    nf6.bestLine = replayUci(game.moves[5]!.fenBefore, ['g7g6', 'h5f3']);
    nf6.explanation = { ...nf6.explanation, summary: 'This allows {mate}.', better: { san: 'g6', text: 'g6 blocks the queen.' } };

    const pgn = annotatedPgn(game, review);
    expect(pgn).toContain('[Annotator "Chess Coach (Stockfish 19)"]');
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('Nf6 $4');
    expect(pgn).toContain('(3... g6 4. Qf3)');
    expect(pgn.split('\n').every((l) => l.length <= 80 || !l.includes(' '))).toBe(true);

    const [parsed] = parsePgn(pgn);
    expect(parsed).toBeDefined();
    const main = [...parsed!.moves.mainline()];
    expect(main.map((n) => n.san)).toEqual(game.moves.map((m) => m.san));
    expect(main[5]?.nags).toEqual([4]);
    const comment = main[5]?.comments?.[0] ?? '';
    expect(comment).toContain('Blunder');
    expect(comment).not.toContain('{');
    expect(parseComment(comment).evaluation).toBeDefined();
    expect(allLegal(startingPosition(parsed!.headers).unwrap(), parsed!.moves.children)).toBe(true);
  });
});
