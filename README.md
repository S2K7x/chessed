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

### Run it on your computer

1. **Install Node.js** 24 LTS from [nodejs.org](https://nodejs.org) (22.12 or
   later works). Check with `node --version`.
2. **Get the code**: `git clone https://github.com/S2K7x/chessed.git`, or
   *Code → Download ZIP* on GitHub and unzip it. Then open a terminal in the
   folder (`cd chessed`).
3. **Install**, once (about ten seconds; it also copies Stockfish and the Maia
   model into `public/`):

   ```bash
   npm install
   ```

4. **Start**:

   ```bash
   npm start
   ```

   Chess Coach opens in your browser at http://localhost:4321. Keep the
   terminal open while you use it, and press Ctrl+C to stop.

On the first visit, type your Lichess or Chess.com username under **Your
latest games** and press **Show my games**, then **Analyse all**: your recent
games are analysed one after the other while you look at the first ones. No
account? Paste a game or a PGN, or press **Try it on an example game**.

Good to know:

- **Your games stay in this browser, for this address.** Use the same browser
  and `npm start` each time. `npm run dev` serves another address
  (http://localhost:5173) with its own, separate data; Settings → Your data
  exports and imports everything.
- **Install it as an app**: in Chrome or Edge, the install icon in the address
  bar adds Chess Coach to your desktop. Once you have analysed a game, it keeps
  working without a connection, and even when `npm start` is no longer running.
- **Update**: `git pull` (or download the ZIP again), then `npm install` and
  `npm start`.

| Problem | What to do |
| --- | --- |
| "Chess Coach needs Node.js 22.12 or later" | Install the current LTS from nodejs.org (or run `nvm use`: the folder has an `.nvmrc`), then `npm install` again. |
| `npm warn EBADENGINE … ts-fsrs` on Node.js 22 | Harmless: that package runs in the browser. Node.js 24 removes the warning. |
| "The chess engine files are missing" | Run `npm install` again. pnpm and Bun skip install scripts by default: use npm, or run `node scripts/copy-engine.mjs`. |
| "Port 4321 is used by another program" | Close that program, or the other terminal running Chess Coach. A second `npm start` while it already runs just opens it. |
| The browser does not open | Open http://localhost:4321 yourself. |
| Analysis is slow | Lower Settings → Analysis depth. Close other heavy programs: Stockfish uses several processor cores (up to 8, leaving one free). |

### Develop

```bash
npm run dev
```

Open http://localhost:5173. Changes reload at once; see [Scripts](#scripts)
for the tests. Both `npm start` and `npm run dev` include the local Chess.com
proxy described under [Importing games](#importing-games).

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
| `npm start` | Build the app and serve it at http://localhost:4321 for everyday use, then open the browser |
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
  own pages use, through a tiny proxy (it sends no CORS headers). With
  `npm start` or `npm run dev` Vite proxies it for you; on a hosted site deploy
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
