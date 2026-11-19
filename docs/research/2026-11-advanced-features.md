# Advanced features research (November 2026)

Mission: [docs/improvement/08-advanced-features-research.md](../improvement/08-advanced-features-research.md).
For each area: what exists elsewhere, what Chess Coach already has, and the
decision. Priorities: **now** (done in this cycle), **next**, **later**,
**no**.

| # | Area | Elsewhere | Here | Decision |
| --- | --- | --- | --- | --- |
| 1 | Opening preparation, personal repertoire | OpeningTree (open source) builds a tree from a player's Lichess or Chess.com games; Repertoire Builder adds gap analysis | Repertoire per position, Lichess explorer, opening trainer from your games | Done earlier; gap analysis comes with opponent preparation (below) |
| 2 | Tactical pattern recognition | Lichess tags puzzles with 100+ themes (lichess-puzzler) | Forks, pins, skewers, discovered attacks, double checks, hanging pieces, removed defenders, back-rank mates | **Now**: smothered and Arabian mates named. **Next**: more mate patterns (Boden, Anastasia, hook) and themes such as deflection or attraction, each with reference positions |
| 3 | Endgame tablebases and training | Lichess API (7 pieces), partial 8-piece tables on the Lichess board (February 2026) | Tablebase verdicts in the review, endgame drills against Stockfish | **Later**: judge drill moves with the tablebase when 7 pieces or fewer (exact, and faster than the engine) |
| 4 | Position evaluation | Stockfish's WDL model: 100 cp = 50% to win, calibrated on material; `UCI_ShowWDL` gives win/draw/loss | Lichess win-percentage curve | **Next**, in a chess-intelligence cycle: measure the classification changes with WDL before deciding; it touches every class |
| 5 | Human-like models | Maia-2 (NeurIPS 2024): one model for all ratings, more coherent across skill levels | Maia-3 (newer, same lab) for "what humans play" and play-outs | Nothing to change |
| 6 | Personalised learning | Knowledge tracing, puzzle ratings | Themes per 100 opportunities, priorities, training by theme | **Next** (mission 7): choose the next exercises from the profile automatically |
| 7 | Spaced repetition | FSRS | FSRS (ts-fsrs) on your own positions, Woodpecker cycles | Done |
| 8 | Automatic exercise generation | Puzzle generators check that the solution is unique: the best move's winning chances clearly above the second best (Feng et al., NeurIPS 2025) | Cards from your mistakes and blunder checks; any move as good as the best is accepted | **Later**: mark "only move" cards (uniqueness) for Woodpecker, where speed on clear patterns matters |
| 9 | Opponent preparation | Lichess explorer's Player tab, OpeningTree, ChessboardMagic's opponent prep ("danger zones") | — | **Now**: done (below) |
| 10 | Long-term tracking | Rating history, accuracy trends | Accuracy trend, rates by theme, improved themes, activity streak | **Later**: rating history from the games' headers |

## Done in this cycle

- **Prepare for an opponent** (Training): their last 50 to 200 games from
  Lichess or Chess.com (six months of archives on Chess.com) grouped by line
  (first four moves of each side), named from the opening book, with their
  score; their best lines (to avoid) and weakest lines (to aim for), from
  three games up. Then the opening trainer plays *their* moves against your
  repertoire: a line ends where you have never had the position, which is
  exactly where to prepare.
- **Mate patterns**: smothered mate (a knight mates a king whose neighbouring
  squares are all taken by its own pieces) and Arabian mate (a rook next to a
  cornered king, protected by a knight) are recognised from the checking piece
  and named in explanations and the glossary.

## Sources

- OpeningTree: <https://github.com/Hyzao/openingtree>
- Lichess opponent preparation (explorer Player tab, third-party tools):
  <https://lichess.org/@/HollowLeaf/blog/opponent-prep-updated/uk1kdQWg>
- Lichess puzzle themes: <https://lichess.org/blog/X-S6gRUAAGjNX4ki/new-puzzles-are-here>
- Stockfish WDL model: <https://github.com/official-stockfish/WDL_model>,
  <https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html>
- Maia-2: <https://arxiv.org/abs/2409.20553>
- Puzzle uniqueness: Feng et al., "Generating Creative Chess Puzzles",
  <https://arxiv.org/abs/2510.23881>
- Lichess 8-piece tablebases (2026):
  <https://lichess.org/@/Lichess/blog/more-than-a-half-year-update-2026/Bu77Rba1>
