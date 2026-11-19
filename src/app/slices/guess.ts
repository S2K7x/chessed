import type { StateCreator } from 'zustand';
import type { Store } from '../store';
import { replayUci } from '../../core/chess';
import type { Color } from '../../core/eval';
import type { Game } from '../../core/game';
import { GUESS_POINTS, guessIndices, guessScore, guessVerdict, type GuessResult } from '../../core/guess';
import { PgnError, parseGames } from '../../core/pgn';
import { judgeAttempt, type AttemptVerdict } from '../../core/retry';
import { db, type GuessRecord } from '../../db/db';
import { engineForPractice, errorText } from '../shared';

/** "Guess the move" through a master game. */
export interface GuessState {
  /** Best results by `${sourceId}:${side}`. */
  best: Record<string, GuessRecord>;
  session?: GuessSession;
}

export interface GuessSession {
  /** A bundled game's id, or `pasted:${game.id}`. */
  sourceId: string;
  game: Game;
  side: Color;
  /** Indices into `game.moves` of the moves to guess. */
  indices: number[];
  /** Position in `indices`. */
  step: number;
  status: 'guessing' | 'judging' | 'revealed' | 'finished';
  results: GuessResult[];
  /** The last guess, in UCI. */
  guessUci?: string;
}

export interface GuessSlice {
  guess?: GuessState;
  openGuess(): Promise<void>;
  /** Starts a bundled game (by id) or a pasted PGN. */
  startGuess(source: { id: string } | { pgn: string }, side?: Color): Promise<void>;
  guessMove(uci: string): Promise<void>;
  guessNext(): Promise<void>;
  leaveGuess(): void;
}

export const createGuessSlice: StateCreator<Store, [], [], GuessSlice> = (set, get) => {

  return {
    async openGuess() {
      const records = await db.guesses.toArray();
      set({ view: 'guess', guess: { best: Object.fromEntries(records.map((r) => [r.id, r])) } });
    },

    async startGuess(source, side) {
      const g = get().guess ?? { best: {} };
      let game: Game;
      let sourceId: string;
      try {
        if ('id' in source) {
          const masterGames = (await import('../../data/masterGames.json')).default;
          const entry = masterGames.find((m) => m.id === source.id);
          if (!entry) return;
          game = parseGames(entry.pgn)[0]!;
          sourceId = entry.id;
        } else {
          const parsed = parseGames(source.pgn)[0];
          if (!parsed || parsed.moves.length < 10) throw new PgnError('This game is too short to guess its moves.');
          game = parsed;
          sourceId = `pasted:${game.id}`;
        }
      } catch (err) {
        set({ error: errorText(err) });
        return;
      }
      const chosen: Color = side ?? (game.result === '0-1' ? 'black' : 'white');
      const indices = guessIndices(game, chosen);
      set({ view: 'guess', guess: { ...g, session: { sourceId, game, side: chosen, indices, step: 0, status: 'guessing', results: [] } } });
    },

    async guessMove(uci) {
      const g = get().guess;
      const s = g?.session;
      if (!g || !s || s.status !== 'guessing') return;
      const index = s.indices[s.step]!;
      const master = s.game.moves[index]!;
      const [played] = replayUci(master.fenBefore, [uci]);
      if (!played) return;
      set({ guess: { ...g, session: { ...s, status: 'judging', guessUci: uci } } });
      let engine: AttemptVerdict['result'] | undefined;
      if (uci !== master.uci) {
        try {
          const engineRef = engineForPractice();
          const depth = Math.max(12, get().settings.depth - 2);
          const before = await engineRef.evaluate(master.fenBefore, { depth, multiPv: 1 });
          engine = (await judgeAttempt(master.fenBefore, uci, before, engineRef, depth)).result;
        } catch (err) {
          set({ error: errorText(err) });
        }
      }
      const verdict = guessVerdict(uci, master.uci, engine);
      const result: GuessResult = { index, guessSan: played.san, masterSan: master.san, verdict, points: GUESS_POINTS[verdict] };
      void get().logActivity({ positions: 1 });
      const cur = get().guess;
      if (!cur?.session || cur.session.sourceId !== s.sourceId || cur.session.step !== s.step) return;
      set({ guess: { ...cur, session: { ...cur.session, status: 'revealed', results: [...cur.session.results, result] } } });
    },

    async guessNext() {
      const g = get().guess;
      const s = g?.session;
      if (!g || !s || s.status !== 'revealed') return;
      const step = s.step + 1;
      if (step < s.indices.length) {
        set({ guess: { ...g, session: { ...s, step, status: 'guessing', guessUci: undefined } } });
        return;
      }
      // The end: keep the best score for this game and side.
      const score = guessScore(s.results);
      const id = `${s.sourceId}:${s.side}`;
      const prev = g.best[id];
      const record: GuessRecord =
        prev && prev.percent >= score.percent
          ? { ...prev, plays: prev.plays + 1 }
          : { id, sourceId: s.sourceId, side: s.side, points: score.points, max: score.max, percent: score.percent, at: Date.now(), plays: (prev?.plays ?? 0) + 1 };
      await db.guesses.put(record);
      set({ guess: { best: { ...g.best, [id]: record }, session: { ...s, status: 'finished' } } });
    },

    leaveGuess() {
      const g = get().guess;
      if (g) set({ guess: { best: g.best } });
    },
  };
};
