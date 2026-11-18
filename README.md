# Chess Coach

Review your Lichess and Chess.com games with Stockfish, understand your
mistakes, and practise the positions where you went wrong.

- **Local analysis.** Stockfish 19 (WebAssembly) runs in your browser; your
  games are stored on your device (IndexedDB). No account, no server costs.
- **Transparent classification.** Best, Excellent, Good, Book, Forced,
  Inaccuracy, Mistake, Missed opportunity, Blunder and Great move, with
  documented rules: see [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md).
- **Explanations grounded in the board.** Each error is explained from facts
  computed on the position and the engine's lines (forced mates, pieces left
  under-defended, forks, missed captures), never from guesses.
- **Learn from your mistakes.** Replay the position before a mistake and find
  a better move; your answer is checked by the engine.

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

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (includes a local Chess.com proxy) |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm test` | Unit tests and Stockfish integration tests (Vitest) |
| `npm run e2e` | End-to-end test in Chromium (Playwright) |
| `npm run openings -- <path>` | Rebuild `src/data/openings.json` from a checkout of lichess-org/chess-openings |

## Importing games

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

## Project layout

```
src/core/      Pure TypeScript analysis core (no DOM): engine driver, classification,
               accuracy, facts, explanations, importers. Runs in Node for tests.
src/engine/    Stockfish in a Web Worker
src/db/        IndexedDB storage (Dexie)
src/app/       Application state (Zustand)
src/ui/        React components (board: chessground)
proxy/         Cloudflare Worker for Chess.com game links
e2e/           Playwright test
```

## License

GPL-3.0-or-later. Stockfish, chessops and chessground are GPL-licensed; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
