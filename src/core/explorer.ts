import type { Fetch } from './import/fetchers';

/**
 * Lichess Opening Explorer (explorer.lichess.ovh). It requires a Lichess
 * login: the app gets a personal token with OAuth (app/lichessAuth.ts).
 */
export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  averageRating?: number;
}

export interface ExplorerResult {
  source: 'masters' | 'lichess';
  total: number;
  white: number;
  draws: number;
  black: number;
  opening?: { eco: string; name: string };
  moves: ExplorerMove[];
}

export class ExplorerAuthError extends Error {}

/** Rating groups of the Lichess database (each from its value to the next). */
export const RATING_GROUPS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

/** The player's rating group and the one above: games of players slightly stronger. */
export function ratingGroupsFor(elo: number | undefined): number[] {
  if (elo === undefined) return [1600, 1800];
  let i = RATING_GROUPS.length - 1;
  while (i > 0 && RATING_GROUPS[i]! > elo) i--;
  return RATING_GROUPS.slice(i, i + 2).map(Number);
}

interface RawMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating?: number;
}

export async function explore(
  fetch: Fetch,
  token: string,
  source: 'masters' | 'lichess',
  fen: string,
  opts: { ratings?: number[]; speeds?: string[] } = {},
): Promise<ExplorerResult> {
  const params = new URLSearchParams({ fen, moves: '6', topGames: '0', recentGames: '0' });
  if (source === 'lichess') {
    params.set('ratings', (opts.ratings ?? [1600, 1800]).join(','));
    params.set('speeds', (opts.speeds ?? ['blitz', 'rapid', 'classical']).join(','));
  }
  const res = await fetch(`https://explorer.lichess.ovh/${source}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new ExplorerAuthError('Connect your Lichess account to use the opening explorer.');
  if (res.status === 429) throw new Error('The opening explorer is busy. Try again in a minute.');
  if (!res.ok) throw new Error(`The opening explorer answered ${res.status}.`);
  const data = (await res.json()) as { white: number; draws: number; black: number; opening?: { eco: string; name: string } | null; moves: RawMove[] };
  const out: ExplorerResult = {
    source,
    white: data.white,
    draws: data.draws,
    black: data.black,
    total: data.white + data.draws + data.black,
    moves: data.moves.map((m) => ({
      uci: m.uci,
      san: m.san,
      white: m.white,
      draws: m.draws,
      black: m.black,
      total: m.white + m.draws + m.black,
      ...(m.averageRating ? { averageRating: m.averageRating } : {}),
    })),
  };
  if (data.opening) out.opening = data.opening;
  return out;
}
