// Checks done before installing and before `npm start`, so that a wrong setup
// fails with a clear message instead of a cryptic one later.
//   node scripts/preflight.mjs           Node.js version only
//   node scripts/preflight.mjs --engine  also the engine files copied by npm install
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN = [22, 12];
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
  console.error(
    `\nChess Coach needs Node.js ${MIN.join('.')} or later; this is Node.js ${process.versions.node}.\n` +
      'Install the current LTS version from https://nodejs.org (or run "nvm use" in this folder), then run "npm install" again.\n',
  );
  process.exit(1);
}

if (process.argv.includes('--engine')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (!existsSync(join(root, 'public', 'engine', 'stockfish-19-lite-single.wasm'))) {
    console.error(
      '\nThe chess engine files are missing (public/engine).\n' +
        'Run "npm install" in this folder: it copies Stockfish there. (pnpm and Bun skip install scripts by default: use npm, or run "node scripts/copy-engine.mjs".)\n',
    );
    process.exit(1);
  }
}
