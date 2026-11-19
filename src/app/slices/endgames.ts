import type { StateCreator } from 'zustand';
import type { Store } from '../store';
import { replayUci } from '../../core/chess';
import { endgameDrills, playEndgameMove, startEndgame, type EndgameAttempt, type EndgameDrill, type EndgameSession } from '../../core/endgame';
import { db } from '../../db/db';
import { engineForPractice, errorText, myColorOf } from '../shared';

/** Endgames from the player's games to win (or hold) again, against Stockfish. */
export interface EndgamesState {
  drills: EndgameDrill[];
  /** Opponent and date of each drill's game. */
  games: Record<string, { opponent: string; date?: string }>;
  session?: EndgameSession;
  /** The engine is answering. */
  thinking?: boolean;
  hints: number;
  /** The best move, shown after a hint. */
  hintUci?: string;
}

export interface EndgamesSlice {
  endgames?: EndgamesState;
  openEndgames(): Promise<void>;
  /** Opens an endgame drill of the game under review. */
  practiseEndgame(id: string): Promise<void>;
  startEndgameDrill(id: string): Promise<void>;
  endgameMove(uci: string): Promise<void>;
  endgameHint(): void;
  /** Leaves the drill (recorded as stopped when moves were played) and returns to the list. */
  leaveEndgame(): Promise<void>;
}

/** Endgames are played a little below the review depth, so that the engine answers quickly. */
const endgameDepth = (depth: number) => Math.max(12, depth - 2);

/** Stores the result of an endgame attempt and returns the updated drills. */
async function recordEndgameAttempt(
  drills: EndgameDrill[],
  id: string,
  result: EndgameAttempt['result'],
  moves: number,
  hints: number,
): Promise<EndgameDrill[]> {
  const drill = drills.find((d) => d.id === id);
  if (!drill) return drills;
  const updated = { ...drill, attempts: [...drill.attempts, { at: Date.now(), result, moves, hints }] };
  await db.endgames.put(updated);
  return drills.map((d) => (d.id === id ? updated : d));
}

export const createEndgamesSlice: StateCreator<Store, [], [], EndgamesSlice> = (set, get) => {

  return {
    async openEndgames() {
      const settings = get().settings;
      const [games, reviews, stored] = await Promise.all([db.games.toArray(), db.reviews.toArray(), db.endgames.toArray()]);
      const byId = new Map(games.map((g) => [g.id, g]));
      const known = new Map(stored.map((d) => [d.id, d]));
      const fresh: EndgameDrill[] = [];
      const info: EndgamesState['games'] = {};
      for (const r of reviews) {
        const game = byId.get(r.gameId);
        const color = game && myColorOf(game, settings);
        if (!game || !color) continue;
        info[game.id] = { opponent: color === 'white' ? game.black.name : game.white.name, ...(game.date ? { date: game.date } : {}) };
        for (const d of endgameDrills(game, r.review, color)) if (!known.has(d.id)) fresh.push(d);
      }
      if (fresh.length) await db.endgames.bulkPut(fresh);
      const drills = [...stored.filter((d) => byId.has(d.gameId)), ...fresh].sort(
        (a, b) => (info[b.gameId]?.date ?? '').localeCompare(info[a.gameId]?.date ?? '') || a.id.localeCompare(b.id),
      );
      set({ view: 'endgames', endgames: { drills, games: info, hints: 0 } });
    },

    async practiseEndgame(id) {
      await get().openEndgames();
      await get().startEndgameDrill(id);
    },

    async startEndgameDrill(id) {
      const e = get().endgames;
      const drill = e?.drills.find((d) => d.id === id);
      if (!e || !drill) return;
      set({ endgames: { ...e, thinking: true, hints: 0, hintUci: undefined, session: undefined } });
      try {
        const session = await startEndgame(drill, engineForPractice(), endgameDepth(get().settings.depth));
        set({ endgames: { ...get().endgames!, session, thinking: false } });
      } catch (err) {
        set({ error: errorText(err), endgames: { ...get().endgames!, thinking: false } });
      }
    },

    async endgameMove(uci) {
      const e = get().endgames;
      if (!e?.session || e.thinking || e.session.status !== 'your-move') return;
      // Show the move at once while the engine thinks.
      const [shown] = replayUci(e.session.fen, [uci]);
      if (!shown) return;
      set({ endgames: { ...e, thinking: true, hintUci: undefined, session: { ...e.session, fen: shown.fenAfter, line: [...e.session.line, shown] } } });
      try {
        const next = await playEndgameMove(e.session, uci, engineForPractice(), endgameDepth(get().settings.depth));
        const cur = get().endgames;
        if (!cur || cur.session?.drill.id !== next.drill.id) return;
        let drills = cur.drills;
        if (next.status !== 'your-move') {
          drills = await recordEndgameAttempt(drills, next.drill.id, next.status, next.playerMoves, cur.hints);
          void get().logActivity({ positions: 1 });
        }
        const drill = drills.find((d) => d.id === next.drill.id) ?? next.drill;
        set({ endgames: { ...cur, drills, thinking: false, session: { ...next, drill } } });
      } catch (err) {
        set({ error: errorText(err), endgames: { ...get().endgames!, thinking: false, session: e.session } });
      }
    },

    endgameHint() {
      const e = get().endgames;
      const best = e?.session?.status === 'your-move' ? e.session.current?.lines[0]?.pv[0] : undefined;
      if (e && best) set({ endgames: { ...e, hints: e.hints + 1, hintUci: best } });
    },

    async leaveEndgame() {
      const e = get().endgames;
      if (!e) return;
      let drills = e.drills;
      const s = e.session;
      if (s && s.status === 'your-move' && s.playerMoves > 0) drills = await recordEndgameAttempt(drills, s.drill.id, 'stopped', s.playerMoves, e.hints);
      set({ endgames: { drills, games: e.games, hints: 0 } });
    },
  };
};
