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
export function parseGames(pgn: string, opts: ParseOptions = {}): Game[] {
  const raw = parsePgn(pgn);
  const games: Game[] = [];
  const errors: string[] = [];
  for (const g of raw) {
    try {
      const game = toGame(g, opts);
      if (game.moves.length > 0) games.push(game);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (games.length === 0) {
    throw new PgnError(errors[0] ?? 'No game with moves was found in this PGN.');
  }
  return games;
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
