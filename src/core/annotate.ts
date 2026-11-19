import { parsePgn } from 'chessops/pgn';
import type { Classification } from './classify';
import { CLASS_LABELS } from './explain';
import { cpEquivalent, type WhiteScore } from './eval';
import type { Game } from './game';
import type { GameReview } from './review';

/** Standard NAGs for move classes ($1 !, $2 ?, $3 !!, $4 ??, $6 ?!). */
const NAG: Partial<Record<Classification, number>> = { brilliant: 3, great: 1, inaccuracy: 6, mistake: 2, miss: 2, blunder: 4 };
const KEPT_HEADERS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'TimeControl', 'ECO', 'Opening', 'Termination', 'SetUp', 'FEN'];

const clean = (s: string) => s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

/** [%eval] value: pawns from White's point of view, or #n for mates. */
function evalText(s: WhiteScore): string {
  if (s.mate !== undefined) return `#${s.mate}`;
  return (cpEquivalent(s) / 100).toFixed(2);
}

/**
 * The game as an annotated PGN: classes as NAGs, the engine evaluation as
 * [%eval], the coach's summary as a comment, and the better line as a
 * variation for every error. Imports into Lichess studies and ChessBase.
 */
export function annotatedPgn(game: Game, review: GameReview): string {
  const parsed = parsePgn(game.pgn)[0];
  const headers = new Map<string, string>();
  for (const k of KEPT_HEADERS) {
    const v = parsed?.headers.get(k);
    if (v) headers.set(k, v);
  }
  headers.set('White', headers.get('White') ?? game.white.name);
  headers.set('Black', headers.get('Black') ?? game.black.name);
  headers.set('Result', game.result);
  headers.set('Annotator', 'Chess Coach (Stockfish 19)');
  if (review.accuracy.white !== undefined) headers.set('WhiteAccuracy', review.accuracy.white.toFixed(1));
  if (review.accuracy.black !== undefined) headers.set('BlackAccuracy', review.accuracy.black.toFixed(1));

  const tokens: string[] = [];
  let needNumber = true;
  review.moves.forEach((m, i) => {
    const number = Math.ceil(m.ply / 2);
    if (m.color === 'white') tokens.push(`${number}.`);
    else if (needNumber) tokens.push(`${number}...`);
    needNumber = false;
    tokens.push(m.san);
    const c = m.assessment.classification;
    const nag = NAG[c];
    if (nag !== undefined) tokens.push(`$${nag}`);
    const after = review.evals[i + 1];
    const best = after && !after.terminal ? after.lines[0] : undefined;
    const evalTag = best ? `[%eval ${evalText(best.score)}]` : '';
    const notable = nag !== undefined || m.isKeyMoment;
    const text = notable
      ? `${CLASS_LABELS[c]}. ${m.explanation.summary}${m.explanation.better ? ` Better: ${m.explanation.better.san}.` : ''}`
      : '';
    if (text || evalTag) {
      tokens.push(`{${[clean(text), evalTag].filter(Boolean).join(' ')}}`);
      needNumber = true;
    }
    if (nag !== undefined && nag !== 1 && nag !== 3 && m.bestLine.length > 0) {
      const parts: string[] = [];
      m.bestLine.slice(0, 8).forEach((b, j) => {
        const [, turn, , , , full] = b.fenBefore.split(' ');
        if (turn === 'w') parts.push(`${full}.`);
        else if (j === 0) parts.push(`${full}...`);
        parts.push(b.san);
      });
      tokens.push(`(${parts.join(' ')})`);
      needNumber = true;
    }
  });
  tokens.push(game.result);

  const head = [...headers.entries()].map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n');
  // Wrap the movetext at about 80 columns, as most PGN writers do.
  const lines: string[] = [];
  let current = '';
  for (const word of tokens.join(' ').split(' ')) {
    if (current && current.length + word.length + 1 > 80) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return `${head}\n\n${lines.join('\n')}\n`;
}
