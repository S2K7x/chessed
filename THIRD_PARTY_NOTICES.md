# Third-party notices

Chess Coach is licensed under the GNU General Public License v3.0 or later
(see `LICENSE`). It includes or depends on:

| Component | License | Use |
| --- | --- | --- |
| [Stockfish](https://github.com/official-stockfish/Stockfish) 19, WASM build by [stockfish.js](https://github.com/nmrugg/stockfish.js) | GPL-3.0 | Chess engine, served from `public/engine/` (copied from the `stockfish` npm package; its license text is shipped next to it as `COPYING.txt`). Source: the links above. |
| [chessops](https://github.com/niklasf/chessops) | GPL-3.0-or-later | Rules, FEN, SAN, PGN, attacks |
| [chessground](https://github.com/lichess-org/chessground) | GPL-3.0-or-later | Board (includes the cburnett piece set) |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | CC0-1.0 | Opening names, `src/data/openings.json` |
| [React](https://react.dev) | MIT | UI |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | State |
| [Dexie](https://dexie.org) | Apache-2.0 | IndexedDB storage |
| [chess-tcn](https://www.npmjs.com/package/chess-tcn) | MIT | Algorithm reference for the TCN decoder (re-implemented, not bundled) |

Algorithms re-implemented from Lichess ([lila](https://github.com/lichess-org/lila),
[scalachess](https://github.com/lichess-org/scalachess), AGPL-3.0): the
win-percentage curve, the accuracy formulas and the phase division. No Lichess
code is copied. Chess.com is a trademark of Chess.com, LLC; this project is not
affiliated with Chess.com or Lichess and uses none of their graphics.
