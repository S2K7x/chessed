# The coach: facts first, words second, checked at the end

Chess Coach never lets a language model analyse a position. The pipeline is:

1. **Engine** (Stockfish 19): evaluations and lines for every position.
2. **Facts** (`src/core/facts/`): deterministic detectors turn the engine's
   lines into verifiable statements: forced mates (back rank included),
   material lost or missed, forks, pins, skewers, discovered attacks, double
   checks, thrown tablebase endgames, structural damage (isolated, doubled
   or conceded passed pawns, weakened king shelter, knight on the rim, early
   queen, undeveloped pieces). Each detector has test positions.
3. **Templates** (`src/core/explain/`): every fact has an English sentence and
   a lesson. This text is always available and is what the app shows by default.
4. **Language model (optional)**: the fact sheet (`src/core/coach/sheet.ts`)
   holds the template sentences, the lines, the move's classification and the
   player's level. The proxy (`proxy/coach.ts`) asks Claude to rewrite it for
   that level, with a JSON schema for the answer.
5. **Verification** (`src/core/coach/verify.ts`): the answer is rejected if it
   mentions a move, a square, a piece placement, a percentage or a mate length
   that is not in the sheet, if its headline contradicts the classification, or
   if it cites no known fact. One retry is made with the list of problems; if it
   still fails, the template text is shown. Accepted texts are cached locally.

## Levels

`beginner` (< 1200), `intermediate` (1200–1800) and `advanced` (> 1800), from
the game's rating or set in Settings. Beginners also see short definitions of
the terms used (fork, pin, passed pawn…).

## Practice

- **Retry this move**: three graded hints (the kind of idea, the piece to move,
  the target square). A wrong answer is explained with the same facts as the
  review.
- **Play on against Maia**: after solving, continue the game against Maia-3,
  a model of human play at the opponent's rating.
- **What players at this level play**: Maia-3's most likely moves for the
  player's rating, with the played move and the best move highlighted.

## Setting up the language-model coach

```bash
cd proxy && npm install
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put COACH_TOKEN
```

Then in the app's Settings, enable "Write explanations with Claude", enter
`https://<your-worker>.workers.dev/coach` and the same token. The model is
`claude-opus-5-5` by default (variable `COACH_MODEL` in `wrangler.toml` to
change it), with low effort and the API's server-side refusal fallback.
