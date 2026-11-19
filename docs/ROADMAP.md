# Roadmap status

| Phase | Status |
| --- | --- |
| 0. Foundations | Done |
| 1. MVP: import, analysis, classification, explanations, retry | Done |
| 2. Complete review: Brilliant, motifs, deep profile, second pass, Lichess sources, clocks, summaries | Done |
| 3. Pedagogy: verified language-model coach, levels, hints, Maia-3, positional facts | Done (language-model coach not yet tried against the live API) |
| 4. Progress: dashboard, rates per opportunity, priorities, spaced training, backups | Done |
| 5. Future: batch analysis, offline app, repertoire, opening explorer | Partly done (below) |

## Phase 5

Done:

- **Batch analysis** from the command line (`npm run analyse`), with a native
  engine option, writing a backup the app imports. Replaces server-side
  analysis without hosting costs.
- **Offline, installable app** (web app manifest + service worker). Replaces a
  native mobile app for now.
- **Personal repertoire**: your earlier choices in the same position, and the
  positions where you vary.
- **Lichess Opening Explorer** (masters, and players around your rating), with
  a Lichess login (OAuth with PKCE, no scope).

Not done, and why:

- **Win % curve by rating band.** It needs fitting on a large set of rated games
  with evaluations (the Lichess open database); the current curve is the
  rating-independent Lichess one. Worth doing once enough of your own games are
  analysed to check the difference matters.
- **Encrypted sync between devices.** Needs a storage backend (for example
  Cloudflare KV behind the existing proxy). The JSON backup covers the need
  today.
- **Native mobile app (Capacitor).** The installable offline web app covers
  phones; a native shell adds little until features need native APIs.

## After phase 5: ideas from other tools

Done:

- **"What does my opponent threaten?"** (button or `x` in the review). The side
  to move passes (a null move) and the engine plays the opponent's best move; a
  mate or a material gain is reported as a threat, with an arrow. Same idea as
  Lichess' Show threat.
- **Blunder-check cards.** A mistake that allowed a concrete punishment (mate or
  material) gives a second training card: from the position after your move,
  find your opponent's best reply. Players' most common advice is to check the
  opponent's replies before moving; this trains that check on your own games.
- **Fast errors.** Moves played much faster than your own pace in the game
  (less than half your average, and under 10 s) are marked in the move list;
  the summary and the dashboard count serious errors played fast.
- **Woodpecker mode** (Axel Smith and Hans Tikkanen's method): a fixed set of
  your own training positions (25, 50, 100 or all), shuffled once and then
  solved in the same order in up to seven cycles. One try per position; a move
  other than the expected one is accepted when the engine finds it as good. The
  clock counts only time spent on positions, so a cycle can span several
  sessions. The next cycle's target is half the last one's time; reported
  schedules roughly halve each cycle (for example 14 days, then 7). Kept apart
  from the spaced-repetition schedule: Woodpecker answers do not change it.
- **Endgame drills.** From each game: the last endgame position you were
  winning (75% or more) before the move that dropped it under 60%, in a game you
  did not win; and the last balanced one (35 to 65%) before the move that lost
  it, in a game you lost. You play it out against Stockfish (a little below the
  review depth). A win is converted at checkmate, when the engine announces a
  forced mate, or with a queen or rook against a bare king (a known mate, which
  the engine does not always announce at that depth). A draw is held by a draw
  under the rules or after 25 moves. A move that drops your chances under the
  same thresholds ends the try, with the engine's answer and the better move.
  Not done yet: a "practise this endgame" link from the review.
- **Guess the move**: 24 decisive master games bundled from the Lichess masters
  database (two per common opening), or any pasted PGN. The opening (first
  eight moves) is skipped. Scoring follows chessgames.com and ChessBase's replay
  training: 3 points for the master's move, 2 when the engine finds another move
  as good, 1 when it is close; no retry, the game's move is then played. The
  best score per game and side is kept.
- **Redesign**: dark charcoal and paper themes, greige board with coordinates
  outside, big light numerals, Jost and Instrument Serif, figurine move list in
  a ruled grid, a tools rail in the review and a four-mode training hub.
- **Annotated PGN export**: classes as NAGs, the evaluation as `[%eval]`, the
  coach's summary as comments and the better line as a variation. Imports into
  Lichess studies and ChessBase.

Tried and not adopted:

- **Analysing positions from the last to the first.** Running the engine
  backwards through the game keeps the hash table useful when the next
  position looks ahead into a line already searched. Measured at depth 14 on
  three games: 23.1 s → 19.7 s on a 91-ply game, but 5.9 s → 7.5 s and
  7.7 s → 8.3 s on shorter ones, with the best move changing in 17 to 40 % of
  positions between the two orders (single-threaded search is deterministic only
  for a given hash state). No clear gain; the second, deeper pass on critical
  moments is what makes results stable.

## Performance work (measured)

Measured on this project's test machine (4 cores, Chromium, production build;
medians of 3 runs).

Done:

- **Progress dashboard.** Naming the tactic you had before each move replayed
  the engine's line for every move of every game on each visit: 571 ms for 201
  games. It is now computed once during the analysis and stored on the move
  (`MoveReview.opportunity`); older reviews compute it once per session.
  Profile computation: 571 ms → 11 ms. The last dashboard also stays on screen
  while it refreshes, so a repeat visit takes 35–56 ms instead of 0.8–1.1 s.
- **First load.** The secondary screens (Progress, Training, Woodpecker,
  Endgames, Guess the move, Settings), the master games and the
  spaced-repetition scheduler (ts-fsrs) load on demand. Main bundle: 638 KB →
  547 KB (gzip 204 KB → 176 KB, −14%). They are fetched while the browser is
  idle, so the service worker still caches everything for offline use (covered
  by the offline end-to-end test).

Measured and left as is:

- **React re-renders.** Every component subscribes to the whole store, which
  the Zustand docs advise against. Measured: 104 commits and 250 ms of script
  over a 60 s analysis, 1.5 ms per move when stepping through a game. Not a
  bottleneck; components can move to selectors when they are next changed.
- **A second engine line only where needed.** MultiPV 2 costs 2.8–2.9× MultiPV 1
  at depth 14, and the second line only matters when the move played is the
  engine's top move (Great, Brilliant). Searching with one line and again with
  two only for those moves saved 3% of the total time on 4 master games (about
  half of master moves are top moves, and the deeper second pass dominates),
  while changing 59 of 291 classifications through search noise. Not adopted.
- **Storing lines compactly.** Lines stored as a starting FEN plus UCI moves
  shrink a review by 63% (250 KB → 90 KB a game), but rebuilding them costs
  about 24 ms a game, which would make the dashboard slower. Not adopted;
  IndexedDB reads 201 reviews in about 50 ms.
- **Engine settings** already follow the Stockfish FAQ: threads = cores − 1, a
  64 MB hash, no hash clearing between positions.

## Usability

- **Batch analysis in the app**: "Analyse all N new games" in Your latest
  games runs both passes on each game not analysed yet, with its own engine,
  so reviewing a game meanwhile is not blocked; it can be stopped. Games
  already analysed are marked.
- **Practise this endgame** from the review: the move where an endgame slipped
  offers its drill directly.
- **Typed moves** on every interactive board (retry, training, Woodpecker,
  endgames, guess the move): SAN or UCI, lower-case piece letters accepted
  (except b, kept for pawn captures), 0-0 for O-O. Typing does not trigger the
  review's keyboard shortcuts.
- **Accessibility audit** with axe-core (WCAG 2.0/2.1 A and AA) on settings,
  games, review, training, guess the move and progress, in both themes. It
  found and fixed: two buttons whose accessible name did not match the visible
  label (WCAG 2.5.3) and grey tags under 4.5:1 contrast in the light theme.

## Repertoire and habits

- **Opening trainer** (`src/core/openingTrainer.ts`): a tree of the positions of
  your games up to move 8. On your turn, the expected move is the one you play
  most; when that move was classified as an error in most of your games, the
  engine's move from those reviews is expected instead (and said so). Your
  other moves that were never errors are accepted too. On your opponents'
  turn, the app plays one of their replies at random in proportion to how often
  it was played, weighted towards the positions you get wrong or have not
  trained. No engine is needed, so it runs instantly and offline. Results per
  position are stored and shown as positions known.
- **Daily goal, streak and calendar**: every position answered in any training
  mode and every game analysed is counted per local day. The streak counts
  consecutive active days up to today (or yesterday while today is still
  open); the goal (Settings, 10 by default) is shown on the training page and
  the dashboard.

## Fixes from a phone-size and accessibility pass

- **Leaving a training session.** Once a spaced-review session had started,
  the Training tab always showed it: there was no way out mid-session, and
  after "Session done" the other modes were unreachable until a reload. A
  session now has Stop, the end screen has Back to training, and the tab
  returns to the training page once a session is finished.
- **PGN files with several games.** All games were saved but only the first was
  analysed, while the others were listed among the analysed games. Games
  without a review are now marked "not analysed" and can be analysed in one go
  (the same background queue as the latest games).
- **Rank numbers** were cut off on phones on the training screens (they are
  drawn outside the board).
- **Accessibility audit** extended to the training sessions (spaced review,
  Woodpecker, endgames, guess the move, openings): no serious violation.

## From the late-2026 research round

- **Free exploration on the review board** (Chess.com now offers variations
  inside Game Review; Lichess' analysis board always had them): any move played
  or typed on the review board starts a variation from that position; each
  position is evaluated (depth ≥ 14) with its best line and an arrow; Play the
  best move, Take back, the arrow keys and Esc work as in the game.
- **Blindfold option** for spaced review and Woodpecker: the position shows for
  five seconds, then the pieces are hidden; the answer is typed or played from
  memory, with a two-second peek. Evidence is thin but positive: a pilot study
  found measurable gains from solving tactics blindfolded, larger below 1900.
- Not done yet: asking for your own assessment of the critical moments before
  showing the engine's (Chessalyz does this; coaches recommend analysing your
  game yourself first).

## Advanced features research (November 2026)

See [research/2026-11-advanced-features.md](research/2026-11-advanced-features.md)
for the ten areas studied, the decisions and the sources. Done: opponent
preparation (their lines, scores, best and weakest lines, and opening
training against their moves) and named mate patterns (smothered, Arabian).
Next: Stockfish WDL measured against the current curve, more tactical themes,
and exercises chosen from the profile.

## Improvement cycle (general, November 2026)

Audit: no known vulnerability (`npm audit`), every training mode covered end
to end; problems found and fixed:

- **PGN import.** Games written without a blank line between them made the
  whole file fail; a game that could not be read inside a multi-game file was
  skipped silently; and a pasted PGN with several games imported only the
  first. Games are now separated before parsing, every game of a pasted PGN is
  kept, and the import says which games could not be read and why ("2 games
  imported; 1 could not be read (game 2 (C – D): Illegal or unreadable move
  2. Ke3.)").
- **Library beyond 200 games.** Only the 200 most recent games were loaded:
  older games could not be opened, deleted or found. The list now pages
  ("Show N older games") and search and filters run over every game.
- **Board rebuilt on every appearance.** The resize observer redrew the board
  (a full DOM rebuild in chessground) on its first notice, right after the
  board was created; under load the rebuild came late enough to swallow a
  click (an intermittent end-to-end failure: 2 runs in 8 under parallel load).
  The board now redraws only when its size really changes: 12 runs in 12.
- **Maintainability.** `store.ts` went from 1,545 to 1,004 lines: the training
  modes (Woodpecker, endgames, openings and opponent, guess the move) are
  Zustand slices in `src/app/slices/`, with shared helpers in
  `src/app/shared.ts`.

## First run on your own computer (November 2026)

A fresh clone was installed and started as a new user would, and the first
screen was looked at with no data. Problems found and fixed:

- **Dead end on the first screen.** "Your latest games" showed two disabled
  buttons and sent the player to Settings to type a username, then back. The
  usernames are now asked right there ("Show my games" saves them and lists
  the last 20 games); with an account saved, only that platform's button is
  shown, with a link to change accounts.
- **Nothing to try without an account.** An empty library now explains the
  three steps (analyse, understand, train) and offers an example game:
  Morphy's Opera Game (1858, public domain, 17 moves, a queen sacrifice and
  mate). It is analysed in about 35 s in the end-to-end test (two browsers in
  parallel).
- **Analysis stuck at 0 % without the engine.** When `public/engine` was
  missing (pnpm and Bun skip install scripts; `--ignore-scripts`), the worker
  loaded the HTML page ("Unexpected token '<'") and the analysis waited
  forever. The engine driver now fails pending and later searches when its
  transport breaks or does not answer `uci` within a minute; the browser engine
  tells a missing file from a broken start ("The chess engine files are
  missing … run npm install again"), a failed engine is replaced on the next
  try, and a batch stops with that message instead of counting every game as
  failed.
- **No everyday command.** `npm start` builds (about 2 s) and serves the app at
  a fixed address, http://localhost:4321, opens the browser, says to keep the
  window open, includes the Chess.com proxy, and when already running just
  opens it. The address is fixed because the browser keeps games per address.
- **Unclear Node.js requirement.** The README said 22+, but Vite needs 22.12.
  `engines`, an `.nvmrc` (24) and a preinstall check now explain an old
  version in one sentence instead of a stack trace; the harmless `ts-fsrs`
  EBADENGINE warning on Node.js 22 is documented.
- **First analysis offline.** The opening book was not prefetched, so a first
  analysis with the server stopped failed, reported as "the game could not be
  downloaded". It is now prefetched when idle, a failed load is retried, and a
  part of the app that cannot be loaded is reported as such. Checked: after one
  analysis, the installed app analyses new games with `npm start` stopped.

Not done: falling back to the single-threaded engine (cached at install) when
the multi-threaded one cannot be loaded offline; it only matters when the
server stops before any analysis.

## French interface (November 2026)

The whole app now switches between English and French: interface, move
explanations and lessons, game summaries, hints, threats, endgame and training
messages, error messages, and the language-model coach. A select in the header
and a choice in Settings switch it; the first visit follows the browser's
language (English otherwise); the choice is kept in `localStorage` so that it
is known before the first render, and `<html lang>` follows it.

**Choice of library: none.** Options compared (sizes are minified + gzipped
runtime, as reported in late 2026 comparisons; they vary with the setup):

| Option | Runtime | Type safety | Lazy locales | Notes |
| --- | --- | --- | --- | --- |
| i18next + react-i18next | about 14 + 6 kB | keys through module augmentation | yes (backends) | a dependency pair and a React provider for two languages |
| Lingui | about 2–4 kB | macros, compiled catalogues | yes | needs a compile step (Babel or SWC macro) and message extraction in the build |
| Paraglide JS (inlang) | about 0.3–1 kB per locale | generated functions | per message | a compiler and an inlang project; messages live outside TypeScript |
| typesafe-i18n | about 1 kB | strong (codegen) | yes | little maintenance since 2023 |
| **Typed dictionary (`src/i18n/`)** | about 1 kB | keys and `{params}` checked by `tsc` | yes (`import('./fr')`) | no dependency, no build step |

The in-house dictionary was chosen: two languages, about 740 messages, and the
type checks we need (a missing key in French, a wrong parameter name) are
compile errors with under 100 lines of code. Plurals use `Intl.PluralRules` (French
counts 0 and 1 as singular), numbers `toLocaleString` ("75,3"), and French
gets a no-break space before `: ; ? !` and `%`.

Measured: the French catalogue is its own chunk (50.4 kB, **15.7 kB gzip**),
loaded only for French readers and prefetched when idle for offline use. The
main chunk went from 572.4 kB (183.9 kB gzip) to 613.2 kB (**194.9 kB gzip,
+11.0 kB**): the English catalogue with its keys, and the runtime. Not
adopted: loading English lazily too (−10 kB on the main chunk, but one more
request before the first render for every English reader, and the fallback
catalogue would no longer be at hand).

**Explanations stay verified facts.** Templates are written in both languages
from the same facts; nothing is translated after the fact. Reviews record the
language of their texts (`review.locale`); opening a review in the other
language writes its explanations and summary again from the stored facts
(templates only, a few milliseconds, no engine). Moves stay in English
algebraic notation in both languages, because the engine lines, the training
input and the coach's verifier use it. The coach's fact sheet carries the
language; the proxy's prompt asks for it, with English move letters; the
verifier also reads French piece names, percentages, "mat en N" and
classification words, and rejects French piece letters (Cf3) that would
otherwise escape the move check. Explanations cached from the coach are kept
per language.

Tests: catalogue parity and parameters, plurals, fallback, typography and
browser-language detection (`src/i18n/i18n.test.ts`); a stored review written
again in French and back, and the verifier on French texts
(`src/core/coach/coach.test.ts`); switching, persistence, a French browser,
the review in French, the axe audit and the absence of horizontal overflow at
phone width in both languages (`e2e/language.spec.ts`). The other end-to-end
tests pin the browser to `en-US`.

Limitations: opening names (from the Lichess opening book) and player names
are not translated; material in endgame drills uses French piece letters
(D, T, F, C) while moves keep the English ones.

Fixed on the way: the opening trainer saved its statistics before moving the
board on, so a move typed right after a correct one was read in the old
position and dropped (the opponent end-to-end test failed 4 runs in 4 on this
machine, on `main` as well). The board now moves first and the statistics are
saved after: 6 runs in 6.
