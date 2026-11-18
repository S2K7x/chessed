export type GameRef =
  | { platform: 'lichess'; id: string }
  | { platform: 'chesscom'; id: string; type: 'live' | 'daily' };

/**
 * Recognises a Lichess or Chess.com game link. Returns undefined for anything
 * else (the caller then treats the input as PGN).
 */
export function parseGameUrl(input: string): GameRef | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'lichess.org') {
    // /{id8}, /{id8}{player4}, /{id8}/black, /game/{id8}, /game/export/{id8}, /embed/game/{id8}
    let candidate = parts[0];
    if (parts[0] === 'game') candidate = parts[1] === 'export' ? parts[2] : parts[1];
    else if (parts[0] === 'embed') candidate = parts[1] === 'game' ? parts[2] : parts[1];
    if (!candidate) return undefined;
    const m = /^([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?$/.exec(candidate);
    return m?.[1] ? { platform: 'lichess', id: m[1] } : undefined;
  }

  if (host === 'chess.com') {
    // /game/live/{id}, /game/daily/{id}, /live/game/{id}, /daily/game/{id},
    // /analysis/game/live/{id}/..., /game/{id}
    const idIndex = parts.findIndex((p) => /^\d+$/.test(p));
    if (idIndex < 0) return undefined;
    const id = parts[idIndex]!;
    const type = parts.slice(0, idIndex).includes('daily') ? 'daily' : 'live';
    if (!parts.slice(0, idIndex).includes('game')) return undefined;
    return { platform: 'chesscom', id, type };
  }
  return undefined;
}
