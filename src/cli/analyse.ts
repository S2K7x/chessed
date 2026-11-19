/**
 * Batch analysis from the command line. Reviews many games with the same core
 * as the app and writes a backup file to import in Settings → Your data.
 *
 *   npm run analyse -- --pgn games.pgn --me myname --out reviews.json
 *   npm run analyse -- --lichess myname --max 50 --depth 16
 *   npm run analyse -- --chesscom myname --engine /usr/bin/stockfish --threads 8
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseGames } from '../core/pgn';
import { chesscomUserGames, lichessUserGames } from '../core/import/fetchers';
import { analyseGame } from '../core/review';
import type { Game } from '../core/game';
import { loadOpeningBook } from '../core/openings';
import { lichessRemote } from '../core/remote';
import { exercisesFromReview, type Exercise } from '../core/training';
import { makeBackup } from './backup';
import { createProcessEngine } from './processEngine';

const USAGE = `Usage: npm run analyse -- [options]
  --pgn <file>         PGN file to analyse (repeatable)
  --lichess <user>     analyse the latest games of a Lichess user
  --chesscom <user>    analyse the latest games of a Chess.com user
  --max <n>            how many games to fetch per platform (default 20)
  --me <user>          your username (to create training cards); defaults to --lichess/--chesscom
  --depth <n>          search depth (default 16)
  --engine <path>      native Stockfish binary (default: the bundled WASM build)
  --threads <n>        threads for a native engine (default 4)
  --no-lichess         do not use Lichess tablebases and cloud evaluations
  --out <file>         output file (default chess-coach-<date>.json)`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pgn: { type: 'string', multiple: true },
      lichess: { type: 'string' },
      chesscom: { type: 'string' },
      max: { type: 'string', default: '20' },
      me: { type: 'string', multiple: true },
      depth: { type: 'string', default: '16' },
      engine: { type: 'string' },
      threads: { type: 'string', default: '4' },
      'no-lichess': { type: 'boolean', default: false },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || (!values.pgn && !values.lichess && !values.chesscom)) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const ctx = { fetch: (url: string, init?: RequestInit) => fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'chess-coach-cli' } }) };
  const games: Game[] = [];
  for (const file of values.pgn ?? []) games.push(...parseGames(readFileSync(file, 'utf8')));
  const max = Number(values.max);
  if (values.lichess) games.push(...(await lichessUserGames(values.lichess, max, ctx)));
  if (values.chesscom) games.push(...(await chesscomUserGames(values.chesscom, max, ctx)));
  const me = [...(values.me ?? []), values.lichess, values.chesscom].filter((x): x is string => !!x).map((x) => x.toLowerCase());

  const depth = Number(values.depth);
  const engine = createProcessEngine({ ...(values.engine ? { binary: values.engine } : {}), threads: Number(values.threads) });
  const remote = values['no-lichess'] ? undefined : lichessRemote(ctx.fetch);
  const book = await loadOpeningBook();
  const entries = [];
  const exercises: Exercise[] = [];
  const started = Date.now();
  try {
    for (const [i, game] of games.entries()) {
      const label = `${game.white.name} – ${game.black.name}${game.date ? ` (${game.date})` : ''}`;
      process.stderr.write(`[${i + 1}/${games.length}] ${label} … `);
      const t0 = Date.now();
      const review = await analyseGame(game, engine, book, { depth, multiPv: 2 }, remote ? { remote } : {});
      entries.push({ game, review });
      const color = me.includes(game.white.name.toLowerCase()) ? 'white' : me.includes(game.black.name.toLowerCase()) ? 'black' : undefined;
      if (color) exercises.push(...(await exercisesFromReview(game, review, color)));
      const acc = color ? review.accuracy[color] : undefined;
      process.stderr.write(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s${acc !== undefined ? `, your accuracy ${acc.toFixed(1)}` : ''}\n`);
    }
  } finally {
    engine.dispose();
  }
  const out = values.out ?? `chess-coach-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(out, JSON.stringify(makeBackup(entries, exercises)));
  process.stderr.write(
    `\n${entries.length} games, ${exercises.length} training positions in ${((Date.now() - started) / 1000).toFixed(0)} s.\nWrote ${out}: import it in Settings → Your data.\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
