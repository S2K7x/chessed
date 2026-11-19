# Third-party notices

Chess Coach is licensed under the GNU General Public License v3.0 or later
(see `LICENSE`). It includes or depends on:

| Component | License | Use |
| --- | --- | --- |
| [Stockfish](https://github.com/official-stockfish/Stockfish) 19, WASM build by [stockfish.js](https://github.com/nmrugg/stockfish.js) | GPL-3.0 | Chess engine, served from `public/engine/` (copied from the `stockfish` npm package; its license text is shipped next to it as `COPYING.txt`). Source: the links above. |
| [chessops](https://github.com/niklasf/chessops) | GPL-3.0-or-later | Rules, FEN, SAN, PGN, attacks |
| [chessground](https://github.com/lichess-org/chessground) | GPL-3.0-or-later | Board (includes the cburnett piece set) |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | CC0-1.0 | Opening names, `src/data/openings.json` |
| [Maia-3](https://github.com/CSSLab/maia3) (CSSLab, University of Toronto) | AGPL-3.0 | Human move prediction model, `public/models/maia3_5m.onnx` (copied from `maia3-js`). Loaded on demand. As an AGPL component, its source is available at the link above; this app's source is linked in Settings. |
| [maia3-js](https://www.npmjs.com/package/maia3-js) | MIT | Maia-3 inference in the browser |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT | Runs Maia-3 (WASM backend) |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript), [Zod](https://zod.dev) | MIT | Proxy `/coach` endpoint only |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | Spaced-repetition scheduling of training positions |
| [React](https://react.dev) | MIT | UI |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | State |
| [Dexie](https://dexie.org) | Apache-2.0 | IndexedDB storage |
| [Jost](https://github.com/indestructible-type/Jost) (via `@fontsource-variable/jost`) | OFL-1.1 | Interface typeface, bundled |
| [Instrument Serif](https://github.com/Instrument/instrument-serif) (via `@fontsource/instrument-serif`) | OFL-1.1 | Display typeface, bundled |
| [Lichess masters database](https://lichess.org/api#tag/Opening-Explorer) | Game scores (facts) | 24 decisive master games in `src/data/masterGames.json` for "Guess the move", fetched by `scripts/fetch-master-games.mjs` |
| [axe-core](https://github.com/dequelabs/axe-core) | MPL-2.0 | Accessibility audit in the end-to-end tests only (development dependency, not shipped) |
| [chess-tcn](https://www.npmjs.com/package/chess-tcn) | MIT | Algorithm reference for the TCN decoder (re-implemented, not bundled) |

Algorithms re-implemented from Lichess ([lila](https://github.com/lichess-org/lila),
[scalachess](https://github.com/lichess-org/scalachess), AGPL-3.0): the
win-percentage curve, the accuracy formulas and the phase division. No Lichess
code is copied. Chess.com is a trademark of Chess.com, LLC; this project is not
affiliated with Chess.com or Lichess and uses none of their graphics.
