# Chess Coach

Review your Lichess and Chess.com games with Stockfish, understand your
mistakes, and practise the positions where you went wrong.

- **Local analysis.** Stockfish 19 (WebAssembly) runs in your browser; your
  games are stored on your device (IndexedDB). No account, no server costs.
- **Transparent classification.** Brilliant (verified sacrifices), Great,
  Best, Excellent, Good, Book, Forced, Inaccuracy, Mistake, Missed opportunity
  and Blunder, with documented rules: see [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md).
- **Deeper where it matters.** A quick or deep profile, then a second, deeper
  pass on every critical moment. Multi-threaded Stockfish when the page is
  cross-origin isolated. Optional Lichess tablebases (exact endgames) and cloud
  evaluations (openings).
- **Explanations grounded in the board.** Each error is explained from facts
  computed on the position and the engine's lines (forced and back-rank mates,
  pieces left under-defended, removed defenders, forks, pins, skewers,
  discovered attacks, double checks, missed captures, thrown endgames, time
  trouble), never from guesses. Each game gets a short written summary.
- **Learn from your mistakes.** Replay the position before a mistake and find
  a better move, with graded hints; your answer is checked and explained by the
  engine. Then play the position on against Maia, a model of human play.
- **Human context.** Maia-3 shows what players of your rating usually play in
  the position: many errors are natural moves, worth understanding.
- **Progress dashboard.** Accuracy game by game and by phase, your errors by
  theme per 100 opportunities (missed tactics are counted against the positions
  where the tactic existed), the three themes to work on first, the errors you
  no longer make, and your openings.
- **Threats and blunder checks.** Ask what your opponent threatens in any
  position (`x`). Mistakes that allowed a concrete punishment also come back as
  blunder checks: find your opponent's best reply to your move.
- **Spaced training.** Every mistake of yours becomes a position to solve again,
  scheduled with FSRS so it comes back when you are about to forget it.
- **Woodpecker method.** Build a set from your training positions and solve it
  again in cycles (up to seven), aiming at about half the time each cycle, with
  one try per position.
- **Endgame drills.** Endgames you were winning and did not win, and drawn
  endgames you lost, come back to be played out against Stockfish: convert the
  win or hold the draw.
- **Guess the move.** Follow a master game from one side and guess each move;
  the master's move scores 3, an engine-approved alternative 2 or 1.
- **Your openings.** A trainer built from your own games: the app plays the
  replies your opponents chose, you play your repertoire move; where your usual
  move was an error, the better move is the one to learn.
- **Prepare for an opponent.** Their recent Lichess or Chess.com games show
  what they play with each colour and where they score best and worst; then
  train your openings against their actual moves.
- **Regular practice.** A daily goal, a streak and a twelve-week calendar of
  your training.
- **Analyse your latest games in one go.** Your last 20 Lichess or Chess.com
  games are analysed one after the other in the background while you keep
  reviewing.
- **Explore freely.** Play any move on the review board: Stockfish evaluates
  each position of your variation and shows its best line.
- **Blindfold training.** An option hides the pieces of training positions
  after five seconds (visualization practice); answer from memory, with a
  peek allowed.
- **Keyboard and accessibility.** Moves can be typed (Nf3, e2e4) on any board
  that expects one; the main screens are checked with axe-core (WCAG 2.1 AA)
  in both themes.
- **Time use.** Time spent on each move, and errors played much faster than
  your own pace.
- **Annotated PGN export** for Lichess studies or ChessBase.
- **Your openings.** In the opening, see what you played in your other games
  from the same position, and (with a Lichess login) what masters and players
  around your rating play. The dashboard lists the choices you have not settled.
- **Works offline.** Install it as an app; once opened, games can be reviewed
  without a connection.
- **Optional language-model coach.** Claude rewrites the verified facts for your
  level (beginner, intermediate, advanced); every answer is checked against the
  board before it is shown. See [docs/COACH.md](docs/COACH.md).

## Getting started

Requires Node.js 22+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173, paste a game link or a PGN, and press **Analyse**.
Add your Lichess and Chess.com usernames in **Settings** so the coach knows
which side you played.

## Design

A warm charcoal (dark) or paper (light) theme around a greige board: big light
numerals for clocks and scores, Jost for the interface, Instrument Serif for
titles and results, figurine notation drawn with the board's own pieces, and a
single yellow accent for the main action. Dark surfaces are never pure black;
lighter surfaces sit higher. Both fonts are bundled, so the app stays offline.

## Development

The project is developed in continuous improvement cycles with Claude Code:
the standing instructions are in [CLAUDE.md](CLAUDE.md), and the focused
missions (chess intelligence, coach, performance, design, learning, security,
research, innovation) in [docs/improvement/](docs/improvement/README.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (includes a local Chess.com proxy) |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm test` | Unit tests and Stockfish integration tests (Vitest) |
| `npm run e2e` | End-to-end test in Chromium (Playwright) |
| `npm run analyse -- --lichess <user> --max 50` | Batch-analyse many games from the command line and write a backup to import (see below) |
| `npm run openings -- <path>` | Rebuild `src/data/openings.json` from a checkout of lichess-org/chess-openings |

## Importing games

- **Your latest games**: with your usernames in Settings, list your last 20
  Lichess or Chess.com games and open one in a click.
- **PGN**: paste it or open a `.pgn` file (several games per file are supported).
- **Lichess link**: fetched from the public Lichess API.
- **Chess.com link**: the app looks the game up in the official monthly
  archive of its players. Chess.com has no public "game by id" endpoint, so to
  read the players of an arbitrary game the app calls the endpoint Chess.com's
  own pages use, through a tiny proxy (it sends no CORS headers). In
  development Vite proxies it for you; in production deploy
  [`proxy/worker.ts`](proxy/worker.ts) as a free Cloudflare Worker and build with
  `VITE_CHESSCOM_PROXY=https://<worker>.workers.dev`. Without the proxy, games
  of the Chess.com username saved in Settings still import by link.

## Batch analysis from the command line

Reviewing many games in the browser takes a while. The command-line tool uses
the same analysis core and writes a backup file to import in Settings → Your
data:

```bash
npm run analyse -- --lichess <user> --max 50 --depth 16 --out reviews.json
```

```bash
npm run analyse -- --pgn games.pgn --me <user> --engine /usr/bin/stockfish --threads 8
```

Without `--engine` it uses the bundled Stockfish WASM; a native Stockfish
binary is several times faster. Your mistakes become training positions.

## Your data

Games, reviews and training cards live in your browser (IndexedDB). Settings →
Your data exports everything as one JSON file and imports it back, for backups
or another device.

## Hosting

The app is a static site. For the multi-threaded engine, serve it with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (see `public/_headers`, read by
Cloudflare Pages and Netlify). Without them it falls back to one thread.

## Project layout

```
src/core/      Pure TypeScript analysis core (no DOM): engine driver, classification,
               accuracy, facts, explanations, importers. Runs in Node for tests.
src/engine/    Stockfish in a Web Worker
src/db/        IndexedDB storage (Dexie)
src/app/       Application state (Zustand)
src/ui/        React components (board: chessground)
proxy/         Cloudflare Worker: Chess.com game links and the optional /coach endpoint
e2e/           Playwright test
```

## License

GPL-3.0-or-later. Stockfish, chessops and chessground are GPL-licensed; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
