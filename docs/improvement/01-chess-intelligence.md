# Chess Intelligence — Deep Audit & Improvement

> Aspect 2 of the menu. Priority: very high.

Run an in-depth audit of the whole chess analysis system.

The goal: bring our analysis engine and classification system close to the
quality of Chess.com Game Review, while keeping them transparent and
verifiable.

Study in particular:

1. The accuracy of the Stockfish evaluations.
2. The handling of evaluations from White's and Black's point of view.
3. The conversion of evaluations into centipawns and winning chances.
4. The handling of mate positions.
5. The move classification thresholds.
6. The detection of Brilliant moves.
7. Errors in winning or losing positions.
8. Forced moves.
9. Tactical errors.
10. Positional errors.
11. Missed opportunities.
12. The quality of the alternative lines.

Research the methods used by Chess.com, Lichess and open-source engines.

Identify the differences between our implementation and the best existing
practices.

Build a set of reference positions to test the classification.

Add regression tests for the edge cases.

Do not just change thresholds arbitrarily: justify every change with chess
examples that can be checked.

Implement the relevant improvements and document the decisions (in
`docs/CLASSIFICATION.md` and `docs/ROADMAP.md`).
