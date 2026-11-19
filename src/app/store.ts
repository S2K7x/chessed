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
import { positionFromFen, replayUci, terminalOf } from '../core/chess';
import { clampMaiaElo, humanMoves, maiaMove } from '../engine/maia';
import { coachExplanation, coachLevel, type CoachResult } from './coach';
import { computeProfile, type Profile, type ProfileEntry } from '../core/profile';
import { dueExercises, exercisesFromReview, gradeAttempt, review as reviewExercise, type Exercise, type TrainingGrade } from '../core/training';
import type { MoveReview } from '../core/review';
import { exportAll, importAll } from '../db/db';
import { buildRepertoire, type Repertoire } from '../core/repertoire';
import { explore, ExplorerAuthError, ratingGroupsFor, type ExplorerResult } from '../core/explorer';
import { epdOf } from '../core/chess';
import { finishLichessLogin, lichessLogout, startLichessLogin } from './lichessAuth';
import { findThreat, type Threat } from '../core/threat';
import { annotatedPgn } from '../core/annotate';
import { chesscomUserGames, lichessUserGames } from '../core/import/fetchers';
import { positionWhiteWinPercent } from '../core/eval';
import { db, DEFAULT_APP_SETTINGS, evalCache, loadSettings, saveSettings, type Settings } from '../db/db';
import { createBrowserEngine, ENGINE_ID } from '../engine/browserEngine';

export type View = 'home' | 'review' | 'progress' | 'training' | 'settings';

export interface RetryState {
  /** Index into review.moves of the mistake being retried. */
  moveIndex: number;
  status: 'solving' | 'judging' | 'done';
  verdict?: AttemptVerdict;
  attempts: number;
}

export interface HumanMovesState {
  moveIndex: number;
  status: 'loading' | 'ready' | 'error';
  elo: number;
  moves?: { uci: string; san: string; probability: number }[];
  error?: string;
}

/** Playing the position on against Maia after solving a retry. */
export interface PlayoutState {
  /** Positions before the current one, oldest first (Maia's history). */
  priorFens: string[];
  /** UCI moves played in the playout (for the last-move highlight). */
  history: string[];
  fen: string;
  userColor: Color;
  /** SAN of the moves played in the playout. */
  sans: string[];
  status: 'user' | 'thinking' | 'over';
  result?: string;
  maiaElo: number;
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
  /** Hints shown in the current retry (0 to 3). */
  hintsShown: number;
  human?: HumanMovesState;
  playout?: PlayoutState;
  /** Language-model explanations by move index. */
  coachTexts: Record<number, CoachResult | 'loading'>;
  profile?: { data: Profile; outdated: number; withoutMe: number } | 'loading';
  training?: TrainingState;
  /** Background re-analysis of games reviewed by an older classifier. */
  reanalysis?: { done: number; total: number };
  dueCount: number;
  /** The player's own opening choices across their games. */
  repertoire?: Repertoire;
  /** Opening explorer results by `${source}|${epd}`. */
  explorer: Record<string, ExplorerResult | 'loading' | { error: string; auth?: boolean }>;
  /** "What does my opponent threaten?" shown for the current position. */
  showThreats: boolean;
  threats: Record<string, Threat | 'loading' | 'none-in-check' | { error: string }>;
}

export interface TrainingState {
  queue: Exercise[];
  index: number;
  status: 'loading' | 'solving' | 'judging' | 'solved' | 'failed' | 'finished';
  startedAt: number;
  hints: number;
  wrong: number;
  verdict?: AttemptVerdict;
  move?: MoveReview;
  evalBefore?: PositionEval;
  game?: Game;
  /** Grades given in this session. */
  results: TrainingGrade[];
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
  showHint(): void;
  loadHumanMoves(moveIndex: number): Promise<void>;
  startPlayout(moveIndex: number): Promise<void>;
  playoutMove(uci: string): Promise<void>;
  endPlayout(): void;
  requestCoach(moveIndex: number): Promise<void>;
  loadProfile(): Promise<void>;
  refreshDueCount(): Promise<void>;
  startTraining(theme?: string): Promise<void>;
  trainingAttempt(uci: string): Promise<void>;
  trainingHint(): void;
  trainingGiveUp(): Promise<void>;
  trainingNext(): Promise<void>;
  reanalyseOutdated(): Promise<void>;
  exportBackup(): Promise<void>;
  importBackup(file: File): Promise<void>;
  loadExplorer(fen: string, source: 'masters' | 'lichess'): Promise<void>;
  toggleThreats(): void;
  loadThreat(fen: string): Promise<void>;
  exportAnnotatedPgn(): void;
  connectLichess(): Promise<void>;
  disconnectLichess(): Promise<void>;
}

const LEVEL_ELO = { beginner: 1000, intermediate: 1500, advanced: 2000 } as const;

/** Lets Maia answer in the playout, or ends it when the game is over. */
async function maiaReply(): Promise<void> {
  const { playout } = useStore.getState();
  if (!playout) return;
  const over = (fen: string) => terminalOf(positionFromFen(fen));
  const finish = (fen: string) => {
    const t = over(fen);
    if (!t) return false;
    const pos = positionFromFen(fen);
    const result = t === 'checkmate' ? (pos.turn === playout.userColor ? 'Maia wins by checkmate.' : 'Checkmate: you win!') : 'Draw.';
    useStore.setState({ playout: { ...useStore.getState().playout!, status: 'over', result } });
    return true;
  };
  if (finish(playout.fen)) return;
  try {
    const uci = await maiaMove(playout.fen, playout.priorFens, playout.maiaElo, playout.maiaElo);
    const current = useStore.getState().playout;
    if (!current || current.fen !== playout.fen) return;
    const [m] = replayUci(current.fen, [uci]);
    if (!m) throw new Error('Maia suggested an illegal move.');
    useStore.setState({
      playout: {
        ...current,
        priorFens: [...current.priorFens, current.fen],
        fen: m.fenAfter,
        history: [...current.history, m.uci],
        sans: [...current.sans, m.san],
        status: 'user',
      },
    });
    finish(m.fenAfter);
  } catch (err) {
    useStore.setState({ error: `Maia could not play: ${errorText(err)}`, playout: undefined });
  }
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
  hintsShown: 0,
  coachTexts: {},
  dueCount: 0,
  explorer: {},
  showThreats: false,
  threats: {},

  async init() {
    let settings = await loadSettings();
    set({ settings, library: await refreshLibrary().catch(() => []) });
    try {
      const login = await finishLichessLogin();
      if (login) {
        settings = { ...settings, lichessToken: login.token, lichessUsername: settings.lichessUsername || login.username || '' };
        await saveSettings(settings);
        set({ settings, view: 'settings' });
      }
    } catch (err) {
      set({ error: errorText(err) });
    }
    void get().refreshDueCount().catch(() => undefined);
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
      human: undefined,
      playout: undefined,
      coachTexts: {},
      library: await refreshLibrary(),
    });

    void buildMyRepertoire(settings).then((repertoire) => set({ repertoire }));
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
      await addExercises(game, review, settings);
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
    set({ cursor: Math.max(0, Math.min(n, cursor)), lineView: undefined, retry: undefined, playout: undefined });
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
    const mover = get().game?.moves[moveIndex]?.color;
    set({
      retry: { moveIndex, status: 'solving', attempts: 0 },
      hintsShown: 0,
      lineView: undefined,
      playout: undefined,
      cursor: moveIndex,
      // Practise from the side that played the move.
      ...(mover ? { orientation: mover } : {}),
    });
  },

  showHint() {
    set({ hintsShown: Math.min(3, get().hintsShown + 1) });
  },

  async loadHumanMoves(moveIndex) {
    const { game, settings, myColor } = get();
    const move = game?.moves[moveIndex];
    if (!game || !move) return;
    const mover = move.color;
    const elo = clampMaiaElo(game[mover].elo ?? LEVEL_ELO[coachLevel(settings, game, myColor)]);
    const oppo = clampMaiaElo(game[mover === 'white' ? 'black' : 'white'].elo ?? elo);
    set({ human: { moveIndex, status: 'loading', elo } });
    try {
      const prior = [game.startFen, ...game.moves.slice(0, moveIndex).map((m) => m.fenAfter)].slice(0, -1);
      const moves = await humanMoves(move.fenBefore, prior, elo, oppo);
      const sans = moves.map((h) => ({ ...h, san: replayUci(move.fenBefore, [h.uci])[0]?.san ?? h.uci }));
      if (get().human?.moveIndex === moveIndex) set({ human: { moveIndex, status: 'ready', elo, moves: sans } });
    } catch (err) {
      set({ human: { moveIndex, status: 'error', elo, error: errorText(err) } });
    }
  },

  async startPlayout(moveIndex) {
    const { game, review, settings, myColor } = get();
    const move = game?.moves[moveIndex];
    const best = review?.moves[moveIndex]?.bestLine[0];
    if (!game || !move || !best) return;
    const userColor = move.color;
    const opponent = userColor === 'white' ? 'black' : 'white';
    const maiaElo = clampMaiaElo(game[opponent].elo ?? game[userColor].elo ?? LEVEL_ELO[coachLevel(settings, game, myColor)]);
    const priorFens = [game.startFen, ...game.moves.slice(0, moveIndex).map((m) => m.fenAfter)];
    set({
      retry: undefined,
      lineView: undefined,
      orientation: userColor,
      playout: { priorFens, history: [best.uci], fen: best.fenAfter, userColor, sans: [best.san], status: 'thinking', maiaElo },
    });
    await maiaReply();
  },

  async playoutMove(uci) {
    const p = get().playout;
    if (!p || p.status !== 'user') return;
    const [m] = replayUci(p.fen, [uci]);
    if (!m) return;
    set({
      playout: { ...p, priorFens: [...p.priorFens, p.fen], fen: m.fenAfter, history: [...p.history, m.uci], sans: [...p.sans, m.san], status: 'thinking' },
    });
    await maiaReply();
  },

  endPlayout() {
    set({ playout: undefined });
  },

  async requestCoach(moveIndex) {
    const { game, review, settings, myColor, coachTexts } = get();
    const m = review?.moves[moveIndex];
    if (!game || !m || coachTexts[moveIndex]) return;
    set({ coachTexts: { ...coachTexts, [moveIndex]: 'loading' } });
    const result = await coachExplanation(m, game, settings, { myColor, ...(review.opening ? { opening: review.opening.name } : {}) });
    if (get().game?.id === game.id) set({ coachTexts: { ...get().coachTexts, [moveIndex]: result } });
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
  async loadProfile() {
    set({ profile: 'loading' });
    const settings = get().settings;
    const games = await db.games.toArray();
    const reviews = new Map((await db.reviews.toArray()).map((r) => [r.gameId, r.review]));
    const entries: ProfileEntry[] = [];
    let outdated = 0;
    let withoutMe = 0;
    for (const game of games) {
      const review = reviews.get(game.id);
      if (!review) continue;
      const color = myColorOf(game, settings);
      if (!color) {
        withoutMe++;
        continue;
      }
      if (review.classifierVersion !== CLASSIFIER_VERSION) outdated++;
      entries.push({ game, review, color });
    }
    set({ profile: { data: computeProfile(entries), outdated, withoutMe }, repertoire: buildRepertoire(entries) });
  },

  async refreshDueCount() {
    const dueCount = await db.exercises.where('due').belowOrEqual(Date.now()).count();
    set({ dueCount });
  },

  async startTraining(theme) {
    const all = await db.exercises.toArray();
    const queue = theme
      ? all.filter((e) => e.theme === theme).sort((a, b) => a.due - b.due).slice(0, 10)
      : dueExercises(all, Date.now(), 10);
    set({
      view: 'training',
      training: { queue, index: 0, status: queue.length ? 'loading' : 'finished', startedAt: Date.now(), hints: 0, wrong: 0, results: [] },
    });
    if (queue.length) await loadTrainingItem(0);
  },

  async trainingAttempt(uci) {
    const t = get().training;
    const ex = t?.queue[t.index];
    if (!t || !ex || t.status !== 'solving' || !t.evalBefore) return;
    set({ training: { ...t, status: 'judging' } });
    try {
      const verdict = await judgeAttempt(ex.fen, uci, t.evalBefore, engineForPractice(), get().settings.depth);
      const cur = get().training!;
      if (verdict.result === 'solved') {
        const grade = gradeAttempt({ solved: true, hints: cur.hints, wrong: cur.wrong, seconds: (Date.now() - cur.startedAt) / 1000 });
        await db.exercises.put(await reviewExercise(ex, grade, cur.hints, cur.wrong));
        set({ training: { ...cur, status: 'solved', verdict, results: [...cur.results, grade] } });
        void get().refreshDueCount();
      } else {
        set({ training: { ...cur, status: 'solving', verdict, wrong: cur.wrong + 1 } });
      }
    } catch (err) {
      set({ error: errorText(err), training: { ...get().training!, status: 'solving' } });
    }
  },

  trainingHint() {
    const t = get().training;
    if (t && t.status === 'solving') set({ training: { ...t, hints: Math.min(3, t.hints + 1) } });
  },

  async trainingGiveUp() {
    const t = get().training;
    const ex = t?.queue[t.index];
    if (!t || !ex || (t.status !== 'solving' && t.status !== 'judging')) return;
    await db.exercises.put(await reviewExercise(ex, 'again', t.hints, t.wrong));
    set({ training: { ...t, status: 'failed', results: [...t.results, 'again'] } });
    void get().refreshDueCount();
  },

  async trainingNext() {
    const t = get().training;
    if (!t) return;
    const index = t.index + 1;
    if (index >= t.queue.length) {
      set({ training: { ...t, index, status: 'finished' } });
      return;
    }
    set({ training: { ...t, index, status: 'loading', hints: 0, wrong: 0, startedAt: Date.now(), verdict: undefined } });
    await loadTrainingItem(index);
  },

  async reanalyseOutdated() {
    if (get().reanalysis) return;
    const settings = get().settings;
    const games = new Map((await db.games.toArray()).map((g) => [g.id, g]));
    const todo = (await db.reviews.toArray()).filter((r) => r.review.classifierVersion !== CLASSIFIER_VERSION && games.has(r.gameId));
    if (todo.length === 0) return;
    set({ reanalysis: { done: 0, total: todo.length } });
    const book = await loadOpeningBook();
    const cache = evalCache(ENGINE_ID);
    // A separate engine, so that opening a game meanwhile is not blocked.
    const engine = createBrowserEngine();
    try {
      for (const [i, stored] of todo.entries()) {
        const game = games.get(stored.gameId)!;
        const analysisSettings = stored.review.settings;
        const evals = await evaluatePositions(game, engine, analysisSettings, { cache });
        const first = buildReview(game, evals, book, analysisSettings, ENGINE_ID);
        const refined = await refineEvaluations(evals, refineTargets(first), engine, analysisSettings, { cache });
        const review = buildReview(game, refined, book, analysisSettings, ENGINE_ID);
        await db.reviews.put({ gameId: game.id, review });
        await addExercises(game, review, settings);
        set({ reanalysis: { done: i + 1, total: todo.length } });
      }
    } catch (err) {
      set({ error: `Re-analysis stopped: ${errorText(err)}` });
    } finally {
      engine.dispose();
      set({ reanalysis: undefined });
      if (get().view === 'progress') void get().loadProfile();
    }
  },

  async exportBackup() {
    const json = await exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-coach-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async importBackup(file) {
    try {
      const n = await importAll(await file.text());
      set({ library: await refreshLibrary(), error: undefined });
      void get().refreshDueCount();
      window.alert(`${n} games imported.`);
    } catch (err) {
      set({ error: errorText(err) });
    }
  },
  async loadExplorer(fen, source) {
    const { settings, game, myColor, explorer } = get();
    const key = `${source}|${epdOf(fen)}`;
    if (explorer[key] && explorer[key] !== 'loading' && !('error' in (explorer[key] as object))) return;
    set({ explorer: { ...explorer, [key]: 'loading' } });
    try {
      const elo = game && myColor ? game[myColor].elo : undefined;
      const result = await explore(browserFetch, settings.lichessToken, source, fen, { ratings: ratingGroupsFor(elo) });
      set({ explorer: { ...get().explorer, [key]: result } });
    } catch (err) {
      set({ explorer: { ...get().explorer, [key]: { error: errorText(err), auth: err instanceof ExplorerAuthError } } });
    }
  },

  async connectLichess() {
    await startLichessLogin();
  },

  async disconnectLichess() {
    const token = get().settings.lichessToken;
    if (token) await lichessLogout(token);
    await get().updateSettings({ lichessToken: '' });
    set({ explorer: {} });
  },
  toggleThreats() {
    set({ showThreats: !get().showThreats });
  },

  async loadThreat(fen) {
    const { threats, settings } = get();
    if (threats[fen]) return;
    set({ threats: { ...threats, [fen]: 'loading' } });
    try {
      const t = await findThreat(fen, engineForPractice(), Math.max(12, settings.depth - 2));
      set({ threats: { ...get().threats, [fen]: t ?? 'none-in-check' } });
    } catch (err) {
      set({ threats: { ...get().threats, [fen]: { error: errorText(err) } } });
    }
  },

  exportAnnotatedPgn() {
    const { game, review } = get();
    if (!game || !review) return;
    const url = URL.createObjectURL(new Blob([annotatedPgn(game, review)], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url;
    const name = `${game.white.name}-${game.black.name}${game.date ? `-${game.date}` : ''}`.replace(/[^\w.-]+/g, '_');
    a.download = `${name}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  },
}));

/** The player's repertoire from every stored game where their side is known. */
async function buildMyRepertoire(settings: Settings): Promise<Repertoire> {
  const games = await db.games.toArray();
  const mine = games.flatMap((game) => {
    const color = myColorOf(game, settings);
    return color ? [{ game, color }] : [];
  });
  return buildRepertoire(mine);
}

/** Creates training cards for the player's mistakes in a review (existing cards are kept). */
async function addExercises(game: Game, review: GameReview, settings: Settings): Promise<void> {
  const color = myColorOf(game, settings);
  if (!color) return;
  const fresh = await exercisesFromReview(game, review, color);
  const existing = new Set((await db.exercises.where('gameId').equals(game.id).primaryKeys()) as string[]);
  const toAdd = fresh.filter((e) => !existing.has(e.id));
  if (toAdd.length) await db.exercises.bulkPut(toAdd);
  void useStore.getState().refreshDueCount();
}

/** Loads the game and review behind a training exercise. */
async function loadTrainingItem(index: number): Promise<void> {
  const t = useStore.getState().training;
  const ex = t?.queue[index];
  if (!t || !ex) return;
  const [game, stored] = await Promise.all([db.games.get(ex.gameId), db.reviews.get(ex.gameId)]);
  const move = stored?.review.moves[ex.moveIndex];
  // A threat card starts after the player's move: the opponent's turn.
  const evalBefore = stored?.review.evals[ex.kind === 'threat' ? ex.moveIndex + 1 : ex.moveIndex];
  const cur = useStore.getState().training;
  if (!cur || cur.index !== index) return;
  if (!game || !move || !evalBefore) {
    // The game was deleted: drop the card and move on.
    await db.exercises.delete(ex.id);
    useStore.setState({ training: { ...cur, status: 'solving' } });
    await useStore.getState().trainingNext();
    return;
  }
  useStore.setState({ training: { ...cur, status: 'solving', game, move, evalBefore, startedAt: Date.now() } });
}
