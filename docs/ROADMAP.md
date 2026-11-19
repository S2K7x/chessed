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
