# Performance Engineering — chessed

> Aspect 5 of the menu.

Run a complete performance audit of Chess Coach AI.

The application must be extremely smooth, even with long games and deep
analyses.

Analyse:

- Initial load time.
- Stockfish WASM start-up time.
- Analysis time per move.
- CPU use.
- Memory use.
- Web Workers.
- Handling of concurrent tasks.
- PGN parsing.
- Board rendering.
- Charts.
- Cache handling.
- Local storage.
- JavaScript bundle size.
- Mobile performance.

Research the best available optimisations for Stockfish WASM and chess
applications in the browser.

Measure performance before any change.

Identify the main bottlenecks.

Implement the optimisations with benchmarks that verify the gains (record the
numbers, and the experiments not adopted, in `docs/ROADMAP.md`).

Careful: never sacrifice the accuracy of the analysis to get artificially
better performance.
