import { describe, expect, it } from 'vitest';
import type { Exercise } from './training';
import {
  canStartCycle,
  createWoodpeckerSet,
  currentCycle,
  cycleStats,
  formatDuration,
  nextExerciseId,
  recordResult,
  startCycle,
  targetMs,
  withoutExercises,
  WOODPECKER_MAX_CYCLES,
  type WoodpeckerSet,
} from './woodpecker';

const ex = (id: string, createdAt: number) => ({ id, createdAt }) as Exercise;
const EXERCISES = Array.from({ length: 8 }, (_, i) => ex(`g:${i}`, 1000 + i));

/** Plays a whole cycle: `ms` per position, all solved except `misses`. */
function playCycle(set: WoodpeckerSet, ms: number, misses: string[] = [], at = 0): WoodpeckerSet {
  let s = startCycle(set, at);
  let id: string | undefined;
  while ((id = nextExerciseId(s))) s = recordResult(s, { exerciseId: id, solved: !misses.includes(id), ms, at: ++at });
  return s;
}

describe('woodpecker sets', () => {
  it('takes the most recent positions, in a fixed shuffled order', () => {
    const a = createWoodpeckerSet(EXERCISES, 5, 42);
    expect(a.exerciseIds).toHaveLength(5);
    expect(new Set(a.exerciseIds)).toEqual(new Set(['g:7', 'g:6', 'g:5', 'g:4', 'g:3']));
    expect(createWoodpeckerSet(EXERCISES, 5, 42).exerciseIds).toEqual(a.exerciseIds);
    expect(createWoodpeckerSet(EXERCISES, 100, 1).exerciseIds).toHaveLength(8);
  });

  it('runs cycles in the same order and ends them on the last position', () => {
    let s = createWoodpeckerSet(EXERCISES, 4, 7);
    expect(nextExerciseId(s)).toBeUndefined();
    s = startCycle(s, 0);
    expect(() => startCycle(s)).toThrow();
    const order: string[] = [];
    let id: string | undefined;
    while ((id = nextExerciseId(s))) {
      order.push(id);
      s = recordResult(s, { exerciseId: id, solved: order.length !== 2, ms: 10_000, at: order.length });
      // Answering the same position twice changes nothing.
      expect(recordResult(s, { exerciseId: id, solved: true, ms: 1, at: 99 })).toBe(s);
    }
    expect(order).toEqual(s.exerciseIds);
    expect(currentCycle(s)).toBeUndefined();
    expect(s.cycles[0]?.finishedAt).toBe(4);
    expect(cycleStats(s, s.cycles[0]!)).toMatchObject({ done: 4, total: 4, solved: 3, accuracy: 75, ms: 40_000 });
    expect(targetMs(s)).toBe(20_000);
  });

  it('stops after the last cycle', () => {
    let s = createWoodpeckerSet(EXERCISES, 5, 3);
    for (let i = 0; i < WOODPECKER_MAX_CYCLES; i++) s = playCycle(s, 5000 / (i + 1));
    expect(s.cycles).toHaveLength(WOODPECKER_MAX_CYCLES);
    expect(canStartCycle(s)).toBe(false);
  });

  it('drops positions whose game was deleted', () => {
    let s = createWoodpeckerSet(EXERCISES, 4, 9);
    s = startCycle(s, 0);
    const [first, second, ...rest] = s.exerciseIds;
    s = recordResult(s, { exerciseId: first!, solved: true, ms: 1000, at: 1 });
    s = recordResult(s, { exerciseId: second!, solved: true, ms: 1000, at: 2 });
    // The two remaining positions disappear: the cycle is complete.
    const pruned = withoutExercises(s, new Set(rest));
    expect(pruned.exerciseIds).toEqual([first, second]);
    expect(currentCycle(pruned)).toBeUndefined();
    expect(withoutExercises(pruned, new Set(['nothing']))).toBe(pruned);
  });

  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
