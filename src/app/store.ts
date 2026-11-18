import { create } from 'zustand';
import { CLASSIFIER_VERSION } from '../core/classify';
import type { UciEngine } from '../core/engine';
import type { Color, PositionEval } from '../core/eval';
import type { PlayableLine } from '../core/explain';
import type { Game } from '../core/game';
import { importGame, ImportError } from '../core/import/fetchers';
import { loadOpeningBook } from '../core/openings';
import { PgnError, parseGames } from '../core/pgn';
import { judgeAttempt, type AttemptVerdict } from '../core/retry';
import {
  buildReview,
  evaluatePositions,
  refineEvaluations,
  refineTargets,
  type AnalysisSettings,
  type GameReview,
} from '../core/review';
import { lichessRemote } from '../core/remote';
import { chesscomUserGames, lichessUserGames } from '../core/import/fetchers';
import { positionWhiteWinPercent } from '../core/eval';
import { db, DEFAULT_APP_SETTINGS, evalCache, loadSettings, saveSettings, type Settings } from '../db/db';
import { createBrowserEngine, ENGINE_ID } from '../engine/browserEngine';

export type View = 'home' | 'review' | 'settings';

export interface RetryState {
  /** Index into review.moves of the mistake being retried. */
  moveIndex: number;
  status: 'solving' | 'judging' | 'done';
  verdict?: AttemptVerdict;
  attempts: number;
}

export interface LineView {
  line: PlayableLine;
  /** Number of moves of the line played on the board (0 = its start). */
  index: number;
  playing: boolean;
}

interface State {
  view: View;
  settings: Settings;
  library: Game[];
  game?: Game;
  review?: GameReview;
  /** White win % per position while the analysis runs. */
  liveWins: (number | undefined)[];
  progress?: { done: number; total: number; phase: 'evaluating' | 'refining' };
  /** Recent games fetched from a platform (not stored until opened). */
  recent?: { platform: 'lichess' | 'chesscom'; games: Game[]; loading: boolean };
  error?: string;
  busy: boolean;
  /** Position shown: 0 = start, i = after move i. */
  cursor: number;
  orientation: Color;
  myColor?: Color;
  lineView?: LineView;
  retry?: RetryState;
}

interface Actions {
  init(): Promise<void>;
  setView(v: View): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  importInput(input: string): Promise<void>;
  importFile(file: File): Promise<void>;
  openGame(game: Game, opts?: { force?: boolean; profile?: Settings['profile'] }): Promise<void>;
  loadRecent(platform: 'lichess' | 'chesscom'): Promise<void>;
  deleteGame(id: string): Promise<void>;
  goTo(cursor: number): void;
  step(delta: number): void;
  flip(): void;
  showLine(line: PlayableLine): void;
  stepLine(delta: number): void;
  closeLine(): void;
  toggleAutoplay(): void;
  startRetry(moveIndex: number): void;
  submitAttempt(uci: string): Promise<void>;
  endRetry(): void;
  dismissError(): void;
}

let analysisEngine: UciEngine | undefined;
let practiceEngine: UciEngine | undefined;
let analysisToken = 0;

const engineForAnalysis = () => (analysisEngine ??= createBrowserEngine());
const engineForPractice = () => (practiceEngine ??= createBrowserEngine());

export function analysisSettingsOf(s: Settings, profile: Settings['profile'] = s.profile): AnalysisSettings {
  return profile === 'deep' ? { depth: Math.max(s.depth + 6, 20), multiPv: 3 } : { depth: s.depth, multiPv: 2 };
}

const browserFetch = (url: string, init?: RequestInit) => fetch(url, init);

function myColorOf(game: Game, s: Settings): Color | undefined {
  const names = [s.lichessUsername, s.chesscomUsername].map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (names.includes(game.white.name.toLowerCase())) return 'white';
  if (names.includes(game.black.name.toLowerCase())) return 'black';
  return undefined;
}

const errorText = (err: unknown): string =>
  err instanceof ImportError || err instanceof PgnError
    ? err.message
    : err instanceof TypeError
      ? 'Network error: the game could not be downloaded. Check your connection, or paste the PGN.'
      : err instanceof Error
        ? err.message
        : String(err);

async function refreshLibrary(): Promise<Game[]> {
  return db.games.orderBy('importedAt').reverse().limit(200).toArray();
}

export const useStore = create<State & Actions>((set, get) => ({
  view: 'home',
  settings: DEFAULT_APP_SETTINGS,
  library: [],
  liveWins: [],
  busy: false,
  cursor: 0,
  orientation: 'white',

  async init() {
    const settings = await loadSettings();
    set({ settings, library: await refreshLibrary().catch(() => []) });
  },

  setView(view) {
    set({ view });
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await saveSettings(settings);
  },

  async importInput(input) {
    const text = input.trim();
    if (!text) return;
    set({ busy: true, error: undefined });
    try {
      const s = get().settings;
      const game = await importGame(text, {
        fetch: browserFetch,
        chesscomProxy: import.meta.env.VITE_CHESSCOM_PROXY ?? (import.meta.env.DEV ? '/proxy/chesscom' : undefined),
        chesscomUsernames: s.chesscomUsername ? [s.chesscomUsername] : [],
      });
      await get().openGame(game);
    } catch (err) {
      set({ error: errorText(err) });
    } finally {
      set({ busy: false });
    }
  },

  async importFile(file) {
    set({ busy: true, error: undefined });
    try {
      const games = parseGames(await file.text());
      for (const g of games) await db.games.put(g);
      set({ library: await refreshLibrary() });
      const first = games[0];
      if (first) await get().openGame(first);
    } catch (err) {
      set({ error: errorText(err) });
    } finally {
      set({ busy: false });
    }
  },

  async openGame(game, opts = {}) {
    const token = ++analysisToken;
    analysisEngine?.cancelAll();
    const settings = get().settings;
    const myColor = myColorOf(game, settings);
    const analysisSettings = analysisSettingsOf(settings, opts.profile);
    await db.games.put(game);
    set({
      game,
      review: undefined,
      liveWins: [],
      progress: { done: 0, total: game.moves.length + 1, phase: 'evaluating' },
      view: 'review',
      cursor: 0,
      orientation: myColor ?? 'white',
      myColor,
      lineView: undefined,
      retry: undefined,
      library: await refreshLibrary(),
    });

    const stored = await db.reviews.get(game.id);
    const s = stored?.review.settings;
    if (
      !opts.force &&
      stored &&
      stored.review.classifierVersion === CLASSIFIER_VERSION &&
      s &&
      s.depth >= analysisSettings.depth &&
      s.multiPv >= analysisSettings.multiPv
    ) {
      set({ review: stored.review, progress: undefined, liveWins: stored.review.whiteWins });
      return;
    }

    const stillCurrent = () => token === analysisToken;
    try {
      const book = await loadOpeningBook();
      const cache = evalCache(ENGINE_ID);
      const engine = engineForAnalysis();
      const evals = await evaluatePositions(game, engine, analysisSettings, {
        cache,
        ...(settings.useLichess ? { remote: lichessRemote(browserFetch) } : {}),
        onProgress: (done, total, partial) => {
          if (!stillCurrent()) return;
          set({
            progress: { done, total, phase: 'evaluating' },
            liveWins: partial.map((e: PositionEval | undefined) => (e ? positionWhiteWinPercent(e) : undefined)),
          });
        },
      });
      if (!stillCurrent()) return;
      // Show the first review at once, then look deeper at the critical moments.
      const first = buildReview(game, evals, book, analysisSettings, ENGINE_ID);
      const targets = refineTargets(first);
      set({ review: first, progress: targets.length ? { done: 0, total: targets.length, phase: 'refining' } : undefined });
      let review = first;
      if (targets.length) {
        const refined = await refineEvaluations(evals, targets, engine, analysisSettings, {
          cache,
          onProgress: (done, total) => {
            if (stillCurrent()) set({ progress: { done, total, phase: 'refining' } });
          },
        });
        if (!stillCurrent()) return;
        review = buildReview(game, refined, book, analysisSettings, ENGINE_ID);
      }
      await db.reviews.put({ gameId: game.id, review });
      if (stillCurrent()) set({ review, progress: undefined });
    } catch (err) {
      if (!stillCurrent()) return;
      if (err instanceof Error && err.message === 'cancelled') return;
      set({ error: `Analysis failed: ${errorText(err)}`, progress: undefined });
    }
  },

  async loadRecent(platform) {
    const s = get().settings;
    const username = platform === 'lichess' ? s.lichessUsername : s.chesscomUsername;
    if (!username.trim()) {
      set({ error: `Add your ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username in Settings first.` });
      return;
    }
    set({ recent: { platform, games: [], loading: true }, error: undefined });
    try {
      const ctx = { fetch: browserFetch };
      const games = platform === 'lichess' ? await lichessUserGames(username.trim(), 20, ctx) : await chesscomUserGames(username.trim(), 20, ctx);
      set({ recent: { platform, games, loading: false } });
    } catch (err) {
      set({ recent: undefined, error: errorText(err) });
    }
  },

  async deleteGame(id) {
    await db.games.delete(id);
    await db.reviews.delete(id);
    set({ library: await refreshLibrary() });
  },

  goTo(cursor) {
    const n = get().game?.moves.length ?? 0;
    set({ cursor: Math.max(0, Math.min(n, cursor)), lineView: undefined, retry: undefined });
  },

  step(delta) {
    const lv = get().lineView;
    if (lv) return get().stepLine(delta);
    get().goTo(get().cursor + delta);
  },

  flip() {
    set({ orientation: get().orientation === 'white' ? 'black' : 'white' });
  },

  showLine(line) {
    set({ lineView: { line, index: Math.min(1, line.moves.length), playing: false } });
  },

  stepLine(delta) {
    const lv = get().lineView;
    if (!lv) return;
    const index = Math.max(0, Math.min(lv.line.moves.length, lv.index + delta));
    set({ lineView: { ...lv, index, playing: lv.playing && index < lv.line.moves.length } });
  },

  toggleAutoplay() {
    const lv = get().lineView;
    if (!lv) return;
    if (lv.playing) return set({ lineView: { ...lv, playing: false } });
    const restart = lv.index >= lv.line.moves.length;
    set({ lineView: { ...lv, index: restart ? 0 : lv.index, playing: true } });
  },

  closeLine() {
    set({ lineView: undefined });
  },

  startRetry(moveIndex) {
    set({ retry: { moveIndex, status: 'solving', attempts: 0 }, lineView: undefined, cursor: moveIndex });
  },

  async submitAttempt(uci) {
    const { retry, review, game, settings } = get();
    if (!retry || !review || !game || retry.status !== 'solving') return;
    const move = game.moves[retry.moveIndex];
    const before = review.evals[retry.moveIndex];
    if (!move || !before) return;
    set({ retry: { ...retry, status: 'judging', attempts: retry.attempts + 1 } });
    try {
      const verdict = await judgeAttempt(move.fenBefore, uci, before, engineForPractice(), settings.depth);
      const r = get().retry;
      if (!r || r.moveIndex !== retry.moveIndex) return;
      set({ retry: { ...r, status: verdict.result === 'solved' ? 'done' : 'solving', verdict } });
    } catch (err) {
      set({ error: errorText(err), retry: { ...retry, status: 'solving' } });
    }
  },

  endRetry() {
    set({ retry: undefined });
  },

  dismissError() {
    set({ error: undefined });
  },
}));
