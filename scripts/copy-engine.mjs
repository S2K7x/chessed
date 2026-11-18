// Copies the Stockfish WASM build shipped by the `stockfish` npm package into
// public/engine so Vite serves it as a static asset next to its .wasm file.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const src = join(modules, 'stockfish');
const dest = join(root, 'public', 'engine');
const files = [
  ['bin/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
  // Multi-threaded build: used when the page is cross-origin isolated.
  ['bin/stockfish-19-lite.js', 'stockfish-19-lite.js'],
  ['bin/stockfish-19-lite.wasm', 'stockfish-19-lite.wasm'],
  ['Copying.txt', 'COPYING.txt'],
];

if (!existsSync(src)) {
  console.warn('[copy-engine] stockfish package not installed yet, skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const [from, to] of files) copyFileSync(join(src, from), join(dest, to));
console.log(`[copy-engine] copied ${files.length} files to public/engine`);

// Maia-3 (human move prediction): the ONNX model. ONNX Runtime's WASM file is
// bundled by Vite.
const maia = [[join(modules, 'maia3-js', 'models', 'maia3_5m.onnx'), join(root, 'public', 'models', 'maia3_5m.onnx')]];
if (maia.every(([from]) => existsSync(from))) {
  for (const [from, to] of maia) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  console.log('[copy-engine] copied the Maia-3 model');
}
