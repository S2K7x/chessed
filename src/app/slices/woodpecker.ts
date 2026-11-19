import { localizeReview } from '../../core/review';
import type { StateCreator } from 'zustand';
import type { Store } from '../store';
import type { PositionEval } from '../../core/eval';
import type { Game } from '../../core/game';
import { judgeAttempt } from '../../core/retry';
import type { MoveReview } from '../../core/review';
import type { Exercise } from '../../core/training';
import { replayUci } from '../../core/chess';
import { createWoodpeckerSet, nextExerciseId, recordResult, startCycle, withoutExercises, type WoodpeckerSet } from '../../core/woodpecker';
import { db } from '../../db/db';
import { engineForPractice, errorText } from '../shared';

/** The Woodpecker method: the same set of the player's positions, solved in faster and faster cycles. */
export interface WoodpeckerState {
  /** The active set (none before the first one is created). */
  set?: WoodpeckerSet;
  /** Training positions available to build a set from. */
  available: number;
  item?: WoodpeckerItem;
}

export interface WoodpeckerItem {
  ex: Exercise;
  game: Game;
  move: MoveReview;
  evalBefore: PositionEval;
  /** When the position was shown (the answer time runs from here). */
  shownAt: number;
  status: 'solving' | 'judging' | 'right' | 'wrong';
  /** The move tried, in SAN. */
  san?: string;
}

export interface WoodpeckerSlice {
  woodpecker?: WoodpeckerState;
  openWoodpecker(): Promise<void>;
  newWoodpeckerSet(size: number): Promise<void>;
  startWoodpeckerCycle(): Promise<void>;
  continueWoodpecker(): Promise<void>;
  woodpeckerAttempt(uci: string): Promise<void>;
  woodpeckerNext(): Promise<void>;
  pauseWoodpecker(): void;
}

export const createWoodpeckerSlice: StateCreator<Store, [], [], WoodpeckerSlice> = (set, get) => {
  /** Shows the next position of the Woodpecker cycle in progress (none at the end of the cycle). */
  async function loadWoodpeckerItem(): Promise<void> {
    const w = get().woodpecker;
    if (!w?.set) return;
    const id = nextExerciseId(w.set);
    if (!id) {
      set({ woodpecker: { set: w.set, available: w.available } });
      return;
    }
    const ex = await db.exercises.get(id);
    const [game, stored] = ex ? await Promise.all([db.games.get(ex.gameId), db.reviews.get(ex.gameId)]) : [];
    const move = ex && stored && game ? localizeReview(stored.review, game).moves[ex.moveIndex] : undefined;
    const evalBefore = ex ? stored?.review.evals[ex.kind === 'threat' ? ex.moveIndex + 1 : ex.moveIndex] : undefined;
    if (!ex || !game || !move || !evalBefore) {
      // The position's game was deleted: take it out of the set and go on.
      const pruned = withoutExercises(w.set, new Set([id]));
      await db.woodpecker.put(pruned);
      set({ woodpecker: { set: pruned, available: w.available } });
      await loadWoodpeckerItem();
      return;
    }
    set({ woodpecker: { set: w.set, available: w.available, item: { ex, game, move, evalBefore, shownAt: Date.now(), status: 'solving' } } });
  }

  return {
    async openWoodpecker() {
      const [sets, exerciseIds] = await Promise.all([db.woodpecker.toArray(), db.exercises.toCollection().primaryKeys()]);
      const known = new Set(exerciseIds as string[]);
      let active = sets.filter((x) => !x.archived).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (active) {
        const pruned = withoutExercises(active, new Set(active.exerciseIds.filter((id) => !known.has(id))));
        if (pruned !== active) await db.woodpecker.put(pruned);
        active = pruned;
      }
      set({ view: 'woodpecker', woodpecker: { available: known.size, ...(active ? { set: active } : {}) } });
    },

    async newWoodpeckerSet(size) {
      const old = get().woodpecker?.set;
      const all = await db.exercises.toArray();
      const fresh = createWoodpeckerSet(all, size);
      await db.transaction('rw', db.woodpecker, async () => {
        if (old) await db.woodpecker.put({ ...old, archived: true });
        await db.woodpecker.put(fresh);
      });
      set({ woodpecker: { available: all.length, set: fresh } });
    },

    async startWoodpeckerCycle() {
      const w = get().woodpecker;
      if (!w?.set) return;
      const next = startCycle(w.set);
      await db.woodpecker.put(next);
      set({ woodpecker: { ...w, set: next } });
      await loadWoodpeckerItem();
    },

    async continueWoodpecker() {
      await loadWoodpeckerItem();
    },

    async woodpeckerAttempt(uci) {
      const w = get().woodpecker;
      const item = w?.item;
      if (!w?.set || !item || item.status !== 'solving') return;
      const ms = Date.now() - item.shownAt;
      const [played] = replayUci(item.ex.fen, [uci]);
      if (!played) return;
      set({ woodpecker: { ...w, item: { ...item, status: 'judging', san: played.san } } });
      let solved = played.san === item.ex.bestSan;
      if (!solved) {
        // Another move can be as good: let the engine judge it.
        try {
          const verdict = await judgeAttempt(item.ex.fen, uci, item.evalBefore, engineForPractice(), get().settings.depth);
          solved = verdict.result === 'solved';
        } catch (err) {
          set({ error: errorText(err) });
        }
      }
      const cur = get().woodpecker;
      if (!cur?.set || cur.item?.ex.id !== item.ex.id) return;
      const next = recordResult(cur.set, { exerciseId: item.ex.id, solved, ms, at: Date.now() });
      void get().logActivity({ positions: 1 });
      await db.woodpecker.put(next);
      set({ woodpecker: { ...cur, set: next, item: { ...item, status: solved ? 'right' : 'wrong', san: played.san } } });
    },

    async woodpeckerNext() {
      await loadWoodpeckerItem();
    },

    pauseWoodpecker() {
      const w = get().woodpecker;
      if (w) set({ woodpecker: { set: w.set!, available: w.available } });
    },
  };
};
