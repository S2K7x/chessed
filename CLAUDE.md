# Chess Coach AI (`chessed`) — instructions for Claude

## Working mode: continuous improvement

This project is developed in continuous improvement cycles. The standing
instruction for every session is the main prompt:

@docs/improvement/00-continuous-improvement.md

The focused missions and the cycle are described in
[docs/improvement/README.md](docs/improvement/README.md).

### "Continue" protocol

- When the user says "continue" (or "continue les améliorations", "continue",
  "next", …) **without naming an aspect**, do not start working. Reply with the
  question **"Sur quel aspect ?"** followed by the numbered menu below, and wait
  for the answer.
- When the user answers (a number or an aspect), read the matching prompt file
  and run that mission in full, following the main prompt's standards (tests,
  build, documentation, roadmap, final report).
- When the user names an aspect directly, run it without asking.
- "Push sur main" (merge to `main`) is done only when the user asks for it and
  every check passes.

Menu (reply with this list):

1. Cycle général d'amélioration — `docs/improvement/00-continuous-improvement.md`
2. Intelligence échiquéenne (évaluations, classification, motifs) — `01-chess-intelligence.md`
3. Coach IA (explications, niveaux, vérification) — `02-ai-coach.md`
4. Veille concurrentielle (Chess.com, Lichess, nouveaux outils) — `03-competitive-intelligence.md`
5. Performances (chargement, moteur, mémoire, bundle) — `04-performance.md`
6. Design et UX (parcours, mobile, accessibilité) — `05-product-design.md`
7. Apprentissage personnalisé (profil, quoi apprendre ensuite) — `06-personalized-learning.md`
8. Sécurité et fiabilité (dépendances, entrées, proxy, licences) — `07-security-reliability.md`
9. Recherche de fonctionnalités avancées (ouvertures, tactique, finales, Maia) — `08-advanced-features-research.md`
10. Innovation et découverte produit (propositions d'abord, sans code) — `09-innovation-discovery.md`

## Language

- Everything in the repository is in English: code, comments, UI text,
  documentation, commit messages.
- Answer the user in French (they write in French).

## Project at a glance

Local-first web app: review Lichess and Chess.com games with Stockfish in the
browser, explain mistakes from verified facts, and train on the player's own
mistakes. No account and no server costs.

- **Stack**: TypeScript (strict), React 19, Vite, Zustand, Dexie (IndexedDB),
  chessops, chessground, Stockfish 19 WASM, Maia-3 (onnxruntime-web), ts-fsrs.
- `src/core/`: pure chess and learning logic, unit-tested with Vitest
  (`*.test.ts` next to the code). Analysis (`review.ts`, `classify.ts`,
  `facts/`, `explain/`), coach verification (`coach/`), training modes
  (`training.ts`, `woodpecker.ts`, `endgame.ts`, `guess.ts`,
  `openingTrainer.ts`), profile and activity.
- `src/app/store.ts`: the application state and actions (Zustand).
- `src/db/db.ts`: IndexedDB schema. A new table means a new Dexie version, and
  adding it to `exportAll` / `importAll` (backups).
- `src/ui/`: React screens. Secondary screens are lazy-loaded in `App.tsx`
  (`loaders`) and prefetched when idle so that the app stays usable offline.
- `src/engine/`: Stockfish worker and Maia.
- `proxy/`: Cloudflare Worker for the optional language-model coach.
- `e2e/`: Playwright tests (desktop and Pixel 7), including the axe-core
  accessibility audit (`a11y.spec.ts`).
- Docs: `README.md`, `docs/ROADMAP.md` (done, measured, not adopted),
  `docs/CLASSIFICATION.md`, `docs/COACH.md`, `THIRD_PARTY_NOTICES.md`.

## Commands

- `npm install` (copies the engine files into `public/engine/`)
- `npm run dev`, `npm run build`, `npm run typecheck`
- `npm test` (Vitest)
- `npm run e2e` (Playwright, `--trace off`; in the cloud container set
  `PW_CHROMIUM=/opt/pw-browsers/chromium`)
- Proxy typecheck: `cd proxy && npx tsc --noEmit -p .`
- `npm run analyse -- --pgn games.pgn --me <name>` (batch analysis CLI)
- Data scripts: `npm run openings`, `node scripts/fetch-master-games.mjs`
  (behind an HTTP proxy, Node needs `NODE_USE_ENV_PROXY=1`).

Before declaring work done: typecheck (app and proxy), unit tests, production
build, the end-to-end tests concerned (the full suite before a merge), and a
look at the changed screens on desktop and at 390 px wide.

## Rules that matter here

- Scores are converted to White's point of view once (`fromUciScore`); win
  percentages use the Lichess curve.
- Every chess claim shown to the user comes from the engine or from our rules
  on the board. A language model only rephrases verified facts, and its output
  is checked by `src/core/coach/verify.ts`; never let it invent moves,
  squares or evaluations.
- Measure before optimising, and record the numbers (and the experiments not
  adopted) in `docs/ROADMAP.md`.
- Keep the accessibility audit passing and the layout working on phones.
- Licence: GPL-3.0-or-later. Maia weights are AGPL-3.0. No Chess.com graphics
  or branding. Record new third-party components in `THIRD_PARTY_NOTICES.md`.
- Never commit secrets (coach token, Lichess token, API keys).
- Git: work on a dedicated branch, open a draft pull request against `main`.
