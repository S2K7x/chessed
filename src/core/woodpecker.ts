import type { Exercise } from './training';
import { t } from '../i18n';

/**
 * The Woodpecker method (Axel Smith and Hans Tikkanen): solve the same set of
 * positions again and again, in cycles, each one faster than the last, so that
 * the patterns become automatic. Here the set is made of the player's own
 * training positions. One try per position; the time counted is the time spent
 * on the positions (pauses between sessions are not counted).
 *
 * The app aims at halving the time of each cycle, for at most seven cycles.
 * These are targets, not rules: accuracy matters more than speed.
 */
export interface WoodpeckerResult {
  exerciseId: string;
  solved: boolean;
  /** Time to answer, in ms. */
  ms: number;
  at: number;
}

export interface WoodpeckerCycle {
  /** 1-based. */
  number: number;
  startedAt: number;
  finishedAt?: number;
  results: WoodpeckerResult[];
}

export interface WoodpeckerSet {
  id: string;
  createdAt: number;
  /** The positions, in the fixed order of every cycle. */
  exerciseIds: string[];
  cycles: WoodpeckerCycle[];
  /** A set replaced by a newer one (kept for history). */
  archived?: boolean;
}

export const WOODPECKER_MAX_CYCLES = 7;
export const WOODPECKER_MIN_SET = 5;

/** Small seeded generator (mulberry32), so that a set's order is reproducible. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A new set from the player's training positions: the `size` most recent ones,
 * shuffled once so that themes and games are mixed, then kept in that order.
 */
export function createWoodpeckerSet(exercises: readonly Exercise[], size: number, now = Date.now()): WoodpeckerSet {
  const picked = [...exercises].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, size);
  const rnd = random(now);
  const ids = picked.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return { id: `wp-${now}`, createdAt: now, exerciseIds: ids, cycles: [] };
}

/** The cycle in progress, if any. */
export function currentCycle(set: WoodpeckerSet): WoodpeckerCycle | undefined {
  const last = set.cycles[set.cycles.length - 1];
  return last && last.finishedAt === undefined ? last : undefined;
}

export function lastFinishedCycle(set: WoodpeckerSet): WoodpeckerCycle | undefined {
  return [...set.cycles].reverse().find((c) => c.finishedAt !== undefined);
}

export function canStartCycle(set: WoodpeckerSet): boolean {
  return !currentCycle(set) && set.cycles.length < WOODPECKER_MAX_CYCLES && set.exerciseIds.length > 0;
}

export function startCycle(set: WoodpeckerSet, now = Date.now()): WoodpeckerSet {
  if (!canStartCycle(set)) throw new Error(t('woodpecker.cannotStart'));
  return { ...set, cycles: [...set.cycles, { number: set.cycles.length + 1, startedAt: now, results: [] }] };
}

/** The next position of the cycle in progress, in the set's order. */
export function nextExerciseId(set: WoodpeckerSet): string | undefined {
  const cycle = currentCycle(set);
  if (!cycle) return undefined;
  const done = new Set(cycle.results.map((r) => r.exerciseId));
  return set.exerciseIds.find((id) => !done.has(id));
}

/**
 * Records one answer; the cycle ends with the last position of the set. A
 * repeated answer, or one outside a cycle, is ignored.
 */
export function recordResult(set: WoodpeckerSet, result: WoodpeckerResult): WoodpeckerSet {
  const cycle = currentCycle(set);
  if (!cycle || !set.exerciseIds.includes(result.exerciseId)) return set;
  if (cycle.results.some((r) => r.exerciseId === result.exerciseId)) return set;
  const results = [...cycle.results, result];
  const finished = set.exerciseIds.every((id) => results.some((r) => r.exerciseId === id));
  const updated: WoodpeckerCycle = { ...cycle, results, ...(finished ? { finishedAt: result.at } : {}) };
  return { ...set, cycles: [...set.cycles.slice(0, -1), updated] };
}

/** Removes positions whose training card no longer exists (deleted game). */
export function withoutExercises(set: WoodpeckerSet, missing: ReadonlySet<string>): WoodpeckerSet {
  if (!set.exerciseIds.some((id) => missing.has(id))) return set;
  const exerciseIds = set.exerciseIds.filter((id) => !missing.has(id));
  const cycles = set.cycles.map((c) => {
    const results = c.results.filter((r) => !missing.has(r.exerciseId));
    const done = c.finishedAt !== undefined || (exerciseIds.length > 0 && exerciseIds.every((id) => results.some((r) => r.exerciseId === id)));
    const last = results[results.length - 1];
    return { ...c, results, ...(done && c.finishedAt === undefined && last ? { finishedAt: last.at } : {}) };
  });
  return { ...set, exerciseIds, cycles };
}

export interface CycleStats {
  done: number;
  total: number;
  solved: number;
  /** Solved / done, in %, or undefined before the first answer. */
  accuracy?: number;
  ms: number;
}

export function cycleStats(set: WoodpeckerSet, cycle: WoodpeckerCycle): CycleStats {
  const solved = cycle.results.filter((r) => r.solved).length;
  const done = cycle.results.length;
  return {
    done,
    total: set.exerciseIds.length,
    solved,
    ...(done ? { accuracy: (100 * solved) / done } : {}),
    ms: cycle.results.reduce((a, r) => a + r.ms, 0),
  };
}

/** The time to aim for in the next (or current) cycle: half the last finished one. */
export function targetMs(set: WoodpeckerSet): number | undefined {
  const last = lastFinishedCycle(set);
  return last ? cycleStats(set, last).ms / 2 : undefined;
}

/** "1:05" or "1:02:05". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
