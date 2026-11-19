import type { Game } from './game';

/** Filters of the game list. */
export interface LibraryFilter {
  /** Player, opening name or ECO code (case-insensitive). */
  query: string;
  speed: string;
  result: string;
}

export const NO_FILTER: LibraryFilter = { query: '', speed: '', result: '' };

export const isFiltering = (f: LibraryFilter): boolean => !!(f.query.trim() || f.speed || f.result);

export function matchesFilter(g: Game, f: LibraryFilter): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && ![g.white.name, g.black.name, g.openingName ?? '', g.eco ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
  if (f.speed && g.timeControl?.speed !== f.speed) return false;
  if (f.result && g.result !== f.result) return false;
  return true;
}

/** Games shown per page of the list. */
export const LIBRARY_PAGE = 200;
