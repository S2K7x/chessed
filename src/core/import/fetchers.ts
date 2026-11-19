import { t } from '../../i18n';
import { makeSan } from 'chessops/san';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { legalUci } from '../chess';
import type { Game } from '../game';
import { parseGame, parseGames, PgnError } from '../pgn';
import { decodeTcn } from './tcn';
import { parseGameUrl, type GameRef } from './urls';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class ImportError extends Error {}

export interface ImportContext {
  fetch: Fetch;
  /** Base URL of the Chess.com callback proxy (see proxy/worker.ts), without trailing slash. */
  chesscomProxy?: string;
  /** Chess.com usernames to search when the callback is unavailable. */
  chesscomUsernames?: string[];
}

const LICHESS = 'https://lichess.org';
const CHESSCOM_API = 'https://api.chess.com/pub';

/** Imports from a game link or from PGN text. */
export async function importGame(input: string, ctx: ImportContext): Promise<Game> {
  const ref = parseGameUrl(input);
  if (!ref) {
    if (/^\s*https?:\/\//.test(input)) throw new ImportError(t('import.badLink'));
    return parseGame(input);
  }
  return ref.platform === 'lichess' ? importLichess(ref.id, ctx) : importChesscom(ref, ctx);
}

export async function importLichess(id: string, ctx: ImportContext): Promise<Game> {
  const url = `${LICHESS}/game/export/${id}?clocks=true&evals=false&opening=true&literate=false`;
  const res = await ctx.fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
  if (res.status === 404) throw new ImportError(t('import.lichess.noGame'));
  if (res.status === 429) throw new ImportError(t('import.lichess.rate'));
  if (!res.ok) throw new ImportError(t('import.lichess.status', { status: res.status }));
  const pgn = await res.text();
  return parseGame(pgn, { source: 'lichess', sourceGameId: id, sourceUrl: `${LICHESS}/${id}` });
}

/** Recent games of a Lichess user, newest first. */
export async function lichessUserGames(username: string, max: number, ctx: ImportContext): Promise<Game[]> {
  const url = `${LICHESS}/api/games/user/${encodeURIComponent(username)}?max=${max}&clocks=true&opening=true&evals=false`;
  const res = await ctx.fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
  if (res.status === 404) throw new ImportError(t('import.lichess.noUser', { name: username }));
  if (!res.ok) throw new ImportError(t('import.lichess.status', { status: res.status }));
  const text = await res.text();
  if (!text.trim()) return [];
  return parseGames(text, { source: 'lichess' }).map((g) => withLichessId(g));
}

function withLichessId(g: Game): Game {
  const ref = g.sourceUrl ? parseGameUrl(g.sourceUrl) : undefined;
  if (ref?.platform !== 'lichess') return g;
  return { ...g, id: `lichess:${ref.id}`, sourceGameId: ref.id };
}

interface ArchiveGame {
  url: string;
  pgn?: string;
  end_time?: number;
  rules?: string;
  white?: { username: string };
  black?: { username: string };
}

async function chesscomArchive(username: string, year: number, month: number, ctx: ImportContext): Promise<ArchiveGame[]> {
  const mm = String(month).padStart(2, '0');
  const res = await ctx.fetch(`${CHESSCOM_API}/player/${encodeURIComponent(username.toLowerCase())}/games/${year}/${mm}`);
  if (res.status === 404) return [];
  if (res.status === 429) throw new ImportError(t('import.chesscom.rate'));
  if (!res.ok) throw new ImportError(t('import.chesscom.status', { status: res.status }));
  const data = (await res.json()) as { games?: ArchiveGame[] };
  return data.games ?? [];
}

const gameIdOf = (url: string) => /\/(\d+)(?:\?.*)?$/.exec(url)?.[1];

function fromArchive(g: ArchiveGame, ref: { id: string }): Game {
  if (!g.pgn) throw new ImportError(t('import.chesscom.noPgn'));
  return parseGame(g.pgn, { source: 'chesscom', sourceGameId: ref.id, sourceUrl: g.url });
}

/** Months to search, newest first: the given month and the one before. */
/** The current month and the ones before it, most recent first. */
function monthsAround(date: Date, count = 2): [number, number][] {
  const out: [number, number][] = [];
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  for (let i = 0; i < count; i++) {
    out.push([y, m]);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

interface CallbackGame {
  game?: {
    id?: number;
    moveList?: string;
    pgnHeaders?: Record<string, string | number>;
    endTime?: number;
  };
  players?: { top?: { username?: string }; bottom?: { username?: string } };
}

export async function importChesscom(ref: Extract<GameRef, { platform: 'chesscom' }>, ctx: ImportContext): Promise<Game> {
  let callback: CallbackGame | undefined;
  if (ctx.chesscomProxy) {
    const res = await ctx.fetch(`${ctx.chesscomProxy}/${ref.type}/game/${ref.id}`);
    if (res.ok) callback = (await res.json()) as CallbackGame;
    else if (res.status === 404) throw new ImportError(t('import.chesscom.noGame'));
  }

  // 1. Official archive of a player of the game (exact PGN with clocks).
  const headers = callback?.game?.pgnHeaders ?? {};
  const players = [headers.White, headers.Black]
    .filter((p): p is string => typeof p === 'string')
    .concat(ctx.chesscomUsernames ?? []);
  const end = callback?.game?.endTime ? new Date(callback.game.endTime * 1000) : new Date();
  for (const username of [...new Set(players.map((p) => p.toLowerCase()))]) {
    for (const [year, month] of monthsAround(end)) {
      const games = await chesscomArchive(username, year, month, ctx);
      const found = games.find((g) => gameIdOf(g.url) === ref.id);
      if (found) return fromArchive(found, ref);
    }
  }

  // 2. Rebuild the PGN from the callback's move list (games too recent for the archive).
  if (callback?.game?.moveList) return fromCallback(callback, ref);

  throw new ImportError(
    ctx.chesscomProxy
      ? t('import.chesscom.notFound')
      : t('import.chesscom.needUser'),
  );
}

function fromCallback(cb: CallbackGame, ref: { id: string; type: string }): Game {
  const h = cb.game?.pgnHeaders ?? {};
  const fen = typeof h.FEN === 'string' ? h.FEN : undefined;
  const pos = fen ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap() : Chess.default();
  const sans: string[] = [];
  for (const uci of decodeTcn(cb.game?.moveList ?? '')) {
    // Chess.com encodes castling as king-takes-rook in some games: try the standard form first.
    const move = legalUci(pos, uci) ?? legalUci(pos, castlingFix(uci));
    if (!move) throw new PgnError(t('import.chesscom.illegal', { uci }));
    sans.push(makeSan(pos, move));
    pos.play(move);
  }
  const tag = (k: string, v: string | number | undefined) => (v === undefined ? '' : `[${k} "${String(v)}"]\n`);
  const pgn =
    tag('Event', h.Event) + tag('Site', `https://www.chess.com/game/${ref.type}/${ref.id}`) + tag('Date', h.Date) +
    tag('White', h.White) + tag('Black', h.Black) + tag('Result', h.Result ?? '*') + tag('WhiteElo', h.WhiteElo) +
    tag('BlackElo', h.BlackElo) + tag('TimeControl', h.TimeControl) + tag('ECO', h.ECO) + tag('SetUp', fen ? '1' : undefined) +
    tag('FEN', fen) + `\n${sans.join(' ')} ${h.Result ?? '*'}\n`;
  return parseGame(pgn, { source: 'chesscom', sourceGameId: ref.id, sourceUrl: `https://www.chess.com/game/${ref.type}/${ref.id}` });
}

const castlingFix = (uci: string): string =>
  ({ e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' })[uci] ?? uci;

/** Recent Chess.com games of a user (current and previous month), newest first. */
export async function chesscomUserGames(username: string, max: number, ctx: ImportContext, months = 2): Promise<Game[]> {
  const out: Game[] = [];
  for (const [year, month] of monthsAround(new Date(), months)) {
    const games = (await chesscomArchive(username, year, month, ctx))
      .filter((g) => (g.rules ?? 'chess') === 'chess' && g.pgn)
      .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    for (const g of games) {
      const id = gameIdOf(g.url);
      if (!id) continue;
      try {
        out.push(fromArchive(g, { id }));
      } catch {
        // Skip unreadable games (variants, broken PGN).
      }
      if (out.length >= max) return out;
    }
  }
  return out;
}
