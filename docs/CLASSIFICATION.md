# How moves are classified (classifier v1.0)

Chess Coach uses its own transparent rules. They are inspired by public
documentation from Chess.com and by Lichess' open-source code, but they do not
try to reproduce Chess.com's private model. The code lives in
`src/core/classify.ts`; any change to a rule bumps `CLASSIFIER_VERSION`, and
stored reviews are re-analysed.

## Win percentage

Every engine score is converted to White's winning chances with the Lichess
curve:

```
win% = 50 + 50 × (2 / (1 + exp(−0.00368208 × cp)) − 1)
```

Centipawns are capped at ±1000 and a forced mate counts as ±1000. Scores
arrive from Stockfish in the side-to-move's point of view and are converted to
White's point of view once, when they are parsed (`fromUciScore`).

For each move, from the mover's point of view:

- **win before** = win% of the engine's best move in the position before the move;
- **win after** = win% of the played move. When the played move is one of the
  engine's MultiPV lines, its score from that same search is used; otherwise
  the evaluation of the position after the move;
- **loss** = max(0, win before − win after).

## Classes

| Class | Rule |
| --- | --- |
| Forced | The only legal move. Excluded from accuracy. |
| Book | Position in the opening book (lichess-org/chess-openings) and loss ≤ 5. Excluded from accuracy. |
| Best | The engine's top move, or loss ≤ 0.5. |
| Excellent | loss ≤ 2 |
| Good | loss ≤ 5 |
| Inaccuracy | loss ≤ 10 |
| Mistake | loss ≤ 20 |
| Blunder | loss > 20 |
| Great move | The engine's top move, and the second-best move loses ≥ 10 more ("only good move"). Not given when the position was already ≥ 90%, for a simple recapture, or when the engine's result is not confident (depth < 10 or bound scores). |
| Missed opportunity | The opponent's previous move was a Mistake or Blunder, the best move kept ≥ 80%, the played move drops below 65% and loses ≥ 5. A loss above 20 stays a Blunder. |
| Brilliant | Not awarded yet (planned: a verified, sound piece sacrifice). |

## Special rules

- **Mates.** Keeping a forced mate, even a slower one, is never an error
  (Best if it is the engine's move, else Excellent). Losing a forced mate while
  still above +7 is at most an Inaccuracy. Allowing a forced mate is flagged.
- **Decided positions.** If the mover is above 97% (or below 3%) both before
  and after the move, the class is capped at Inaccuracy.
- **Confidence.** Low engine confidence (depth < 10 or a bound score) is shown
  and prevents "Great move".

For comparison: Chess.com publishes expected-points bands of 0.02 / 0.05 / 0.10
/ 0.20 computed with a rating-dependent model that is not public; Lichess
flags Inaccuracy / Mistake / Blunder at 5 / 10 / 15 win-% points.

## Accuracy

Per move: `103.1668 × exp(−0.04354 × loss) − 3.1669 + 1`, clamped to 0–100
(Lichess). Per game: the average of a volatility-weighted mean and a harmonic
mean of move accuracies (Lichess), leaving out Book and Forced moves. Scores
are not comparable with Chess.com's CAPS2.
