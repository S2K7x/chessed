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
import { buildReview, evaluatePositions, type GameReview } from '../core/review';
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
}

interface State {
  view: View;
  settings: Settings;
  library: Game[];
  game?: Game;
  review?: GameReview;
  /** White win % per position while the analysis runs. */
  liveWins: (number | undefined)[];
  progress?: { done: number; total: number };
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
  openGame(game: Game): Promise<void>;
  deleteGame(id: string): Promise<void>;
  goTo(cursor: number): void;
  step(delta: number): void;
  flip(): void;
  showLine(line: PlayableLine): void;
  stepLine(delta: number): void;
  closeLine(): void;
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
        fetch: (url, init) => fetch(url, init),
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

  async openGame(game) {
    const token = ++analysisToken;
    analysisEngine?.cancelAll();
    const settings = get().settings;
    const myColor = myColorOf(game, settings);
    await db.games.put(game);
    set({
      game,
      review: undefined,
      liveWins: [],
      progress: { done: 0, total: game.moves.length + 1 },
      view: 'review',
      cursor: 0,
      orientation: myColor ?? 'white',
      myColor,
      lineView: undefined,
      retry: undefined,
      library: await refreshLibrary(),
    });

    const stored = await db.reviews.get(game.id);
    if (stored && stored.review.classifierVersion === CLASSIFIER_VERSION && stored.review.settings.depth >= settings.depth) {
      set({ review: stored.review, progress: undefined, liveWins: stored.review.whiteWins });
      return;
    }

    try {
      const book = await loadOpeningBook();
      const analysisSettings = { depth: settings.depth, multiPv: 2 };
      const evals = await evaluatePositions(game, engineForAnalysis(), analysisSettings, {
        cache: evalCache(ENGINE_ID),
        onProgress: (done, total, partial) => {
          if (token !== analysisToken) return;
          set({
            progress: { done, total },
            liveWins: partial.map((e: PositionEval | undefined) => (e ? positionWhiteWinPercent(e) : undefined)),
          });
        },
      });
      if (token !== analysisToken) return;
      const review = buildReview(game, evals, book, analysisSettings, ENGINE_ID);
      await db.reviews.put({ gameId: game.id, review });
      set({ review, progress: undefined });
    } catch (err) {
      if (token !== analysisToken) return;
      if (err instanceof Error && err.message === 'cancelled') return;
      set({ error: `Analysis failed: ${errorText(err)}`, progress: undefined });
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
    set({ lineView: { line, index: Math.min(1, line.moves.length) } });
  },

  stepLine(delta) {
    const lv = get().lineView;
    if (!lv) return;
    set({ lineView: { ...lv, index: Math.max(0, Math.min(lv.line.moves.length, lv.index + delta)) } });
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
