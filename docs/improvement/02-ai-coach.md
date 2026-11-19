# AI Chess Coach — Pedagogical Intelligence Upgrade

> Aspect 3 of the menu. Priority: very high.

Turn the current coach into a true, personalised chess teacher.

Audit the whole system that generates and verifies the explanations
(`src/core/explain`, `src/core/coach`, `docs/COACH.md`).

Goals:

- Explain precisely why a move is good or bad.
- Adapt the explanations to the player's rating.
- Identify tactical and positional errors.
- Explain the consequences of decisions.
- Give advice that can be applied in the next games.
- Avoid generic explanations.
- Avoid hallucinations.

Study the possible improvements with language models, deterministic rule
systems and data from Stockfish.

Every explanation must rest on structured evidence:

- Starting position.
- Move played.
- Best move.
- Main line.
- Evaluation before and after.
- Tactical or positional motif identified.
- Verified consequence.

The coach must distinguish:

1. What the engine confirms mathematically.
2. What our rules identify.
3. What is a teaching interpretation.

Add a validation system for the explanations.

Also offer several levels of explanation:

- Beginner.
- Intermediate.
- Advanced.

Implement the improvements and add tests that detect incorrect or overly
vague explanations.
