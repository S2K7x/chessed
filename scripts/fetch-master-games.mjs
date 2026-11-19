// Builds src/data/masterGames.json: decisive master games from the Lichess
// masters database (explorer.lichess.ovh), across common openings, for the
// "Guess the move" trainer. Run with `node scripts/fetch-master-games.mjs`.
import { writeFileSync } from 'node:fs';

// Opening positions (UCI moves from the start) to take games from.
const OPENINGS = [
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], // Ruy Lopez
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], // Italian
  ['e2e4', 'c7c5', 'g1f3', 'd7d6'], // Sicilian
  ['e2e4', 'c7c5', 'g1f3', 'b8c6'], // Sicilian
  ['e2e4', 'e7e6'], // French
  ['e2e4', 'c7c6'], // Caro-Kann
  ['d2d4', 'd7d5', 'c2c4', 'e7e6'], // Queen's Gambit Declined
  ['d2d4', 'd7d5', 'c2c4', 'c7c6'], // Slav
  ['d2d4', 'g8f6', 'c2c4', 'g7g6'], // King's Indian / Grünfeld
  ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4'], // Nimzo-Indian
  ['c2c4'], // English
  ['g1f3', 'd7d5'], // Réti
];
const PER_OPENING = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(60_000);
      continue;
    }
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return json ? res.json() : res.text();
  }
  throw new Error(`${url}: rate limited`);
}

const games = [];
const seen = new Set();
for (const line of OPENINGS) {
  const data = await get(`https://explorer.lichess.ovh/masters?play=${line.join(',')}&topGames=15&moves=0`);
  let taken = 0;
  for (const g of data.topGames ?? []) {
    if (taken >= PER_OPENING || seen.has(g.id) || !g.winner) continue;
    await sleep(1000);
    const pgn = (await get(`https://explorer.lichess.ovh/masters/pgn/${g.id}`, false)).trim();
    const plies = pgn.split('\n\n')[1]?.split(/\s+/).filter((t) => !/^\d+\.$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)).length ?? 0;
    // Long enough to be worth guessing, short enough for one sitting.
    if (plies < 40 || plies > 120) continue;
    seen.add(g.id);
    games.push({ id: g.id, opening: data.opening?.name ?? '', pgn });
    taken++;
  }
  await sleep(1000);
}
writeFileSync(new URL('../src/data/masterGames.json', import.meta.url), `${JSON.stringify(games, null, 1)}\n`);
console.log(`${games.length} games`);
