import { makePgn, parsePgn, parseComment, startingPosition, type PgnNodeData, type Game as PgnGame } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { fenOf } from './chess';
import { hashString, parseTimeControl, type Game, type GameMove, type Platform } from './game';

export class PgnError extends Error {}

export interface ParseOptions {
  source?: Platform;
  sourceUrl?: string;
  sourceGameId?: string;
}

/** Parses every game of a PGN text. Throws `PgnError` if none is valid. */
/** A game of a PGN file that could not be read. */
export interface SkippedGame {
  /** 1-based position in the file. */
  index: number;
  /** "White – Black", when the headers name them. */
  players?: string;
  reason: string;
}

/**
 * Some exports put a game's headers right after the previous game's moves,
 * without the blank line that separates games: add it, so that each game is
 * read on its own.
 */
export function separateGames(pgn: string): string {
  const lines = pgn.replace(/^\uFEFF/, '').split(/\r?\n/);
  const out: string[] = [];
  const isTag = (l: string) => /^\s*\[[A-Za-z0-9_]+\s+"/.test(l);
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (isTag(line) && prev !== undefined && prev.trim() !== '' && !isTag(prev)) out.push('');
    out.push(line);
  }
  return out.join('\n');
}

/** Every game of a PGN, and the ones that could not be read (with the reason). */
export function parseGamesReport(pgn: string, opts: ParseOptions = {}): { games: Game[]; skipped: SkippedGame[] } {
  const raw = parsePgn(separateGames(pgn));
  const games: Game[] = [];
  const skipped: SkippedGame[] = [];
  raw.forEach((g, i) => {
    const white = g.headers.get('White');
    const black = g.headers.get('Black');
    const players = white && black ? `${white} – ${black}` : undefined;
    try {
      const game = toGame(g, opts);
      if (game.moves.length > 0) games.push(game);
      else if (raw.length > 1) skipped.push({ index: i + 1, ...(players ? { players } : {}), reason: 'No moves.' });
    } catch (err) {
      skipped.push({ index: i + 1, ...(players ? { players } : {}), reason: err instanceof Error ? err.message : String(err) });
    }
  });
  return { games, skipped };
}

export function parseGames(pgn: string, opts: ParseOptions = {}): Game[] {
  const { games, skipped } = parseGamesReport(pgn, opts);
  if (games.length === 0) {
    throw new PgnError(skipped[0]?.reason ?? 'No game with moves was found in this PGN.');
  }
  return games;
}

/** A sentence about the games of a file that could not be read, or undefined when all were. */
export function skippedText(skipped: readonly SkippedGame[], read: number): string | undefined {
  if (skipped.length === 0) return undefined;
  const first = skipped[0]!;
  const which = `game ${first.index}${first.players ? ` (${first.players})` : ''}: ${first.reason}`;
  const more = skipped.length > 1 ? ` and ${skipped.length - 1} more` : '';
  return `${read} game${read === 1 ? '' : 's'} imported; ${skipped.length} could not be read (${which}${more}).`;
}

export function parseGame(pgn: string, opts: ParseOptions = {}): Game {
  const first = parseGames(pgn, opts)[0];
  if (!first) throw new PgnError('No game found.');
  return first;
}

function header(g: PgnGame<PgnNodeData>, key: string): string | undefined {
  const v = g.headers.get(key);
  if (v === undefined || v === '' || v === '?' || v === '????.??.??') return undefined;
  return v;
}

function elo(v: string | undefined): number | undefined {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : undefined;
}

function isoDate(v: string | undefined): string | undefined {
  const m = v && /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function toGame(g: PgnGame<PgnNodeData>, opts: ParseOptions): Game {
  const start = startingPosition(g.headers);
  if (start.isErr) throw new PgnError(`Invalid starting position: ${start.error.message}`);
  const pos = start.value;
  const startFen = fenOf(pos);
  const moves: GameMove[] = [];
  let ply = pos.turn === 'white' ? 1 : 2;
  for (const node of g.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) {
      const label = `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`;
      throw new PgnError(`Illegal or unreadable move ${label} ${node.san}.`);
    }
    const fenBefore = fenOf(pos);
    const color = pos.turn;
    const san = makeSan(pos, move);
    pos.play(move);
    const gm: GameMove = { ply, color, san, uci: makeUci(move), fenBefore, fenAfter: fenOf(pos) };
    for (const c of node.comments ?? []) {
      const clock = parseComment(c).clock;
      if (clock !== undefined) gm.clockMs = Math.round(clock * 1000);
    }
    moves.push(gm);
    ply++;
  }

  const white = header(g, 'White') ?? 'White';
  const black = header(g, 'Black') ?? 'Black';
  const site = header(g, 'Site') ?? header(g, 'Link');
  const date = isoDate(header(g, 'UTCDate') ?? header(g, 'Date'));
  const tc = parseTimeControl(header(g, 'TimeControl'));
  const eco = header(g, 'ECO');
  const opening = header(g, 'Opening');
  const termination = header(g, 'Termination');
  const sourceUrl = opts.sourceUrl ?? (site && /^https?:\/\//.test(site) ? site : undefined);
  const id = opts.sourceGameId
    ? `${opts.source ?? 'pgn'}:${opts.sourceGameId}`
    : `pgn:${hashString(`${startFen}|${moves.map((m) => m.uci).join(' ')}|${white}|${black}|${date ?? ''}`)}`;

  const game: Game = {
    id,
    source: opts.source ?? 'pgn',
    white: { name: white },
    black: { name: black },
    result: header(g, 'Result') ?? '*',
    startFen,
    moves,
    pgn: '',
    importedAt: Date.now(),
  };
  const we = elo(header(g, 'WhiteElo'));
  const be = elo(header(g, 'BlackElo'));
  if (we !== undefined) game.white.elo = we;
  if (be !== undefined) game.black.elo = be;
  if (sourceUrl) game.sourceUrl = sourceUrl;
  if (opts.sourceGameId) game.sourceGameId = opts.sourceGameId;
  if (date) game.date = date;
  if (tc) game.timeControl = tc;
  if (eco) game.eco = eco;
  if (opening) game.openingName = opening;
  if (termination) game.termination = termination;
  game.pgn = makePgn(g);
  return game;
}
