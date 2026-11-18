// Builds src/data/openings.json from the lichess-org/chess-openings TSV files
// (CC0-1.0, https://github.com/lichess-org/chess-openings).
// Usage: node scripts/build-openings.mjs <path-to-chess-openings-checkout>
// Output: { [epd]: [eco, name] | 0 }, keyed by board, turn, castling and en
// passant square. Named positions carry their ECO code and name; positions met
// on the way to a named line are stored as 0 (still "book", but unnamed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node scripts/build-openings.mjs <chess-openings dir>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = {};
const epdOf = (pos) => makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');
let count = 0;
for (const file of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']) {
  const lines = readFileSync(join(srcDir, file), 'utf8').trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const pos = Chess.default();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of sans) {
      const move = parseSan(pos, san);
      if (!move) throw new Error(`illegal ${san} in ${eco} ${name}`);
      pos.play(move);
      const epd = epdOf(pos);
      if (!(epd in out)) out[epd] = 0;
    }
    // A named line always names its final position (first name listed wins).
    const epd = epdOf(pos);
    if (!out[epd]) out[epd] = [eco, name];
    count++;
  }
}
mkdirSync(join(root, 'src', 'data'), { recursive: true });
writeFileSync(join(root, 'src', 'data', 'openings.json'), JSON.stringify(out));
const named = Object.values(out).filter(Boolean).length;
console.log(`openings: ${count} lines, ${named} named positions, ${Object.keys(out).length} book positions`);
