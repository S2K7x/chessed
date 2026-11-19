import { epdOf } from './chess';
import type { Color } from './eval';
import type { Game } from './game';

/**
 * The player's own opening repertoire, built from their games: for every
 * position (up to `maxPly`) where it was their turn, which moves they chose
 * and how those games ended.
 */
export interface RepertoireMove {
  san: string;
  uci: string;
  count: number;
  /** Points scored from the player's side (1 win, 0.5 draw). */
  points: number;
  gameIds: string[];
}

export interface Repertoire {
  /** EPD → the player's moves there. */
  positions: Map<string, Map<string, RepertoireMove>>;
  /** EPD → the moves that first led there, e.g. "1. e4 e5 2. Nf3". */
  lines: Map<string, string>;
}

export const REPERTOIRE_MAX_PLY = 24;

const pointsFor = (result: string, color: Color) =>
  result === '1/2-1/2' ? 0.5 : (result === '1-0' && color === 'white') || (result === '0-1' && color === 'black') ? 1 : 0;

export function buildRepertoire(games: { game: Game; color: Color }[], maxPly = REPERTOIRE_MAX_PLY): Repertoire {
  const rep: Repertoire = { positions: new Map(), lines: new Map() };
  for (const { game, color } of games) {
    if (game.result === '*') continue;
    const points = pointsFor(game.result, color);
    const path: string[] = [];
    for (const m of game.moves) {
      if (m.ply > maxPly) break;
      const prefix = path.join(' ');
      path.push(m.color === 'white' ? `${Math.ceil(m.ply / 2)}. ${m.san}` : path.length === 0 ? `${Math.ceil(m.ply / 2)}... ${m.san}` : m.san);
      if (m.color !== color) continue;
      const key = epdOf(m.fenBefore);
      if (!rep.lines.has(key)) rep.lines.set(key, prefix);
      const moves = rep.positions.get(key) ?? new Map<string, RepertoireMove>();
      const entry = moves.get(m.san) ?? { san: m.san, uci: m.uci, count: 0, points: 0, gameIds: [] };
      entry.count++;
      entry.points += points;
      entry.gameIds.push(game.id);
      moves.set(m.san, entry);
      rep.positions.set(key, moves);
    }
  }
  return rep;
}

/** Your earlier choices in this position, most played first (optionally ignoring one game). */
export function myChoicesAt(rep: Repertoire, fen: string, excludeGameId?: string): (RepertoireMove & { score: number })[] {
  const moves = rep.positions.get(epdOf(fen));
  if (!moves) return [];
  return [...moves.values()]
    .map((m) => {
      const keep = excludeGameId ? m.gameIds.filter((id) => id !== excludeGameId) : m.gameIds;
      const removed = m.gameIds.length - keep.length;
      return { ...m, count: m.count - removed, gameIds: keep };
    })
    .filter((m) => m.count > 0)
    .map((m) => ({ ...m, score: m.points / Math.max(1, m.count) }))
    .sort((a, b) => b.count - a.count);
}

/** Positions where the player has chosen different moves (a repertoire to settle). */
export function inconsistencies(rep: Repertoire, minGames = 3): { epd: string; line: string; moves: RepertoireMove[] }[] {
  return [...rep.positions.entries()]
    .map(([epd, moves]) => ({ epd, line: rep.lines.get(epd) ?? '', moves: [...moves.values()].sort((a, b) => b.count - a.count) }))
    .filter((p) => p.moves.length >= 2 && p.moves.reduce((n, m) => n + m.count, 0) >= minGames)
    .sort((a, b) => b.moves.reduce((n, m) => n + m.count, 0) - a.moves.reduce((n, m) => n + m.count, 0));
}
