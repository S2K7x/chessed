import { epdOf, replayUci, type SanMove } from './chess';
import { ERROR_CLASSES } from './classify';
import type { Color } from './eval';
import type { Game } from './game';
import type { GameReview } from './review';

/**
 * An opening trainer built from the player's own games: the app plays the
 * replies their opponents actually chose, and the player must find their
 * repertoire move. When the move they usually play was judged an error, the
 * engine's move is expected instead.
 */
export interface TrainerMove {
  san: string;
  uci: string;
  count: number;
  /** Games where this move was classified as an inaccuracy, mistake, miss or blunder. */
  errors: number;
}

export interface TrainerNode {
  epd: string;
  fen: string;
  /** The player's moves (the player to move here). */
  mine: Map<string, TrainerMove>;
  /** The opponents' moves (the opponent to move here). */
  theirs: Map<string, TrainerMove>;
  /** The engine's best move here, when one of the player's moves here was an error. */
  best?: { san: string; uci: string };
}

export type OpeningTree = Map<string, TrainerNode>;

/** Opening depth trained: the first eight moves of each side. */
export const TRAINER_MAX_PLY = 16;

export function buildOpeningTree(entries: { game: Game; review?: GameReview; color: Color }[], color: Color, maxPly = TRAINER_MAX_PLY): OpeningTree {
  const tree: OpeningTree = new Map();
  for (const { game, review, color: c } of entries) {
    if (c !== color) continue;
    for (const [i, m] of game.moves.entries()) {
      if (m.ply > maxPly) break;
      const epd = epdOf(m.fenBefore);
      const node: TrainerNode = tree.get(epd) ?? { epd, fen: m.fenBefore, mine: new Map(), theirs: new Map() };
      const r = review?.moves[i];
      const isError = r ? ERROR_CLASSES.has(r.assessment.classification) : false;
      const side = m.color === color ? node.mine : node.theirs;
      const entry = side.get(m.uci) ?? { san: m.san, uci: m.uci, count: 0, errors: 0 };
      entry.count++;
      if (isError) entry.errors++;
      side.set(m.uci, entry);
      if (m.color === color && isError && r?.bestLine[0] && !node.best) node.best = { san: r.bestLine[0].san, uci: r.bestLine[0].uci };
      tree.set(epd, node);
    }
  }
  return tree;
}

export interface Expected {
  /** The move to learn here. */
  main: { san: string; uci: string };
  /** Moves accepted as right (the main one, and the player's other moves that were never errors). */
  accepted: Set<string>;
  /** The player's usual move here, when it was mostly an error and the engine's move is expected instead. */
  usualError?: string;
}

/** What the player should play in this position, or undefined when they never had it on the board. */
export function expectedAt(node: TrainerNode | undefined): Expected | undefined {
  if (!node || node.mine.size === 0) return undefined;
  const moves = [...node.mine.values()].sort((a, b) => b.count - a.count || a.errors - b.errors);
  const usual = moves[0]!;
  const sound = moves.filter((m) => m.errors === 0);
  const accepted = new Set(sound.map((m) => m.uci));
  if (usual.errors * 2 > usual.count) {
    // The usual move is mostly an error: learn the best move instead.
    const main = node.best ?? sound[0];
    if (!main) return undefined;
    accepted.add(main.uci);
    return { main: { san: main.san, uci: main.uci }, accepted, usualError: usual.san };
  }
  accepted.add(usual.uci);
  return { main: { san: usual.san, uci: usual.uci }, accepted };
}

/** Per-position results of the player in the trainer (stored). */
export interface OpeningStat {
  /** `${color}|${epd}` */
  id: string;
  right: number;
  wrong: number;
  lastAt: number;
}

/**
 * The opponent's reply: one their opponents played, chosen at random with the
 * frequency it was played, and more often towards positions the player gets
 * wrong (or has not trained yet).
 */
export function pickReply(
  tree: OpeningTree,
  node: TrainerNode,
  color: Color,
  stats: ReadonlyMap<string, OpeningStat>,
  random: () => number = Math.random,
): TrainerMove | undefined {
  const options = [...node.theirs.values()].map((m) => {
    const [after] = replayUci(node.fen, [m.uci]);
    const next = after ? tree.get(epdOf(after.fenAfter)) : undefined;
    const st = next ? stats.get(`${color}|${next.epd}`) : undefined;
    const need = st ? (1 + 2 * st.wrong) / (1 + st.right) : 1.5;
    return { m, weight: m.count * need * (expectedAt(next) ? 1 : 0.25) };
  });
  const total = options.reduce((a, o) => a + o.weight, 0);
  if (total <= 0) return undefined;
  let r = random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.m;
  }
  return options[options.length - 1]?.m;
}

/**
 * Training against one opponent: the player's own tree, where the replies are
 * the moves that opponent played (from their tree, built for their colour).
 * Positions the opponent never reached have no reply, so lines follow only
 * what they actually play.
 */
export function againstOpponent(mine: OpeningTree, theirs: OpeningTree): OpeningTree {
  const out: OpeningTree = new Map();
  for (const [epd, node] of mine) out.set(epd, { ...node, theirs: new Map() });
  for (const [epd, node] of theirs) {
    if (node.mine.size === 0) continue;
    const target = out.get(epd) ?? { epd, fen: node.fen, mine: new Map(), theirs: new Map() };
    target.theirs = new Map(node.mine);
    out.set(epd, target);
  }
  return out;
}

/** A seeded random generator (mulberry32), for reproducible lines in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many positions of the tree the player has to know, and how many they got right last time. */
export function trainerCoverage(tree: OpeningTree, color: Color, stats: ReadonlyMap<string, OpeningStat>): { positions: number; known: number } {
  let positions = 0;
  let known = 0;
  for (const node of tree.values()) {
    if (!expectedAt(node)) continue;
    positions++;
    const st = stats.get(`${color}|${node.epd}`);
    if (st && st.right > st.wrong) known++;
  }
  return { positions, known };
}

export type { SanMove };
