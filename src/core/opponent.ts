import { epdOf, type SanMove } from './chess';
import type { Color } from './eval';
import type { Game } from './game';
import { openingAt, type OpeningBook } from './openings';

/**
 * Preparing for an opponent from their own games (as OpeningTree or the
 * Lichess explorer's Player tab do): what they play with each colour, how
 * well it goes for them, and where they are at their best or worst.
 */
export interface OpponentLine {
  /** The first moves of the line, e.g. "1. e4 c5 2. Nf3". */
  moves: string;
  /** The opening reached, by its deepest named position. */
  opening?: string;
  games: number;
  /** The opponent's points per game (1 win, 0.5 draw). */
  score: number;
}

export interface OpponentSide {
  games: number;
  score: number;
  /** Most played lines, most frequent first. */
  lines: OpponentLine[];
  /** Lines played at least three times where they score 65% or more: the openings to avoid. */
  strong: OpponentLine[];
  /** Lines played at least three times where they score 35% or less: the openings to aim for. */
  weak: OpponentLine[];
}

export interface OpponentReport {
  username: string;
  games: number;
  white: OpponentSide;
  black: OpponentSide;
}

/** Plies of a line grouped together: the first four moves of each side. */
export const OPPONENT_LINE_PLIES = 8;
const MIN_GAMES = 3;

const pointsFor = (result: string, color: Color) =>
  result === '1/2-1/2' ? 0.5 : (result === '1-0' && color === 'white') || (result === '0-1' && color === 'black') ? 1 : 0;

/** The colour `username` had in a game, if they played it. */
export function colorOf(game: Game, username: string): Color | undefined {
  const u = username.trim().toLowerCase();
  if (game.white.name.toLowerCase() === u) return 'white';
  if (game.black.name.toLowerCase() === u) return 'black';
  return undefined;
}

function lineText(moves: readonly SanMove[]): string {
  return moves
    .map((m) => {
      const [, turn, , , , full] = m.fenBefore.split(' ');
      return turn === 'w' ? `${full}. ${m.san}` : m.san;
    })
    .join(' ');
}

export function opponentReport(games: readonly Game[], username: string, book?: OpeningBook, plies = OPPONENT_LINE_PLIES): OpponentReport {
  const sides: Record<Color, { games: number; points: number; lines: Map<string, { moves: string; opening?: string; games: number; points: number }> }> = {
    white: { games: 0, points: 0, lines: new Map() },
    black: { games: 0, points: 0, lines: new Map() },
  };
  let total = 0;
  for (const game of games) {
    const color = colorOf(game, username);
    if (!color || game.result === '*' || game.moves.length === 0) continue;
    total++;
    const side = sides[color];
    const points = pointsFor(game.result, color);
    side.games++;
    side.points += points;
    const moves = game.moves.slice(0, plies);
    const key = moves.map((m) => m.uci).join(' ');
    const entry = side.lines.get(key) ?? { moves: lineText(moves), games: 0, points: 0 };
    if (book && entry.opening === undefined) {
      for (let i = moves.length - 1; i >= 0; i--) {
        const o = openingAt(book, moves[i]!.fenAfter);
        if (o) {
          entry.opening = o.name;
          break;
        }
      }
    }
    entry.games++;
    entry.points += points;
    side.lines.set(key, entry);
  }
  const summarise = (c: Color): OpponentSide => {
    const s = sides[c];
    const lines = [...s.lines.values()]
      .map((l) => ({ moves: l.moves, ...(l.opening ? { opening: l.opening } : {}), games: l.games, score: l.points / l.games }))
      .sort((a, b) => b.games - a.games || b.score - a.score);
    const frequent = lines.filter((l) => l.games >= MIN_GAMES);
    return {
      games: s.games,
      score: s.games ? s.points / s.games : 0,
      lines,
      strong: frequent.filter((l) => l.score >= 0.65).sort((a, b) => b.score - a.score),
      weak: frequent.filter((l) => l.score <= 0.35).sort((a, b) => a.score - b.score),
    };
  };
  return { username, games: total, white: summarise('white'), black: summarise('black') };
}

/** The opponent's most played move in a position (by EPD), for a quick look-up. */
export function opponentMovesAt(games: readonly Game[], username: string, fen: string): { san: string; count: number }[] {
  const epd = epdOf(fen);
  const counts = new Map<string, number>();
  for (const game of games) {
    const color = colorOf(game, username);
    if (!color) continue;
    for (const m of game.moves) {
      if (m.color !== color) continue;
      if (epdOf(m.fenBefore) === epd) counts.set(m.san, (counts.get(m.san) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([san, count]) => ({ san, count })).sort((a, b) => b.count - a.count);
}
