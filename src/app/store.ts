import { create } from 'zustand';
import { CLASSIFIER_VERSION } from '../core/classify';
import type { UciEngine } from '../core/engine';
import type { Color, PositionEval } from '../core/eval';
import type { PlayableLine } from '../core/explain';
import type { Game } from '../core/game';
import { importGame, ImportError } from '../core/import/fetchers';
import { loadOpeningBook, type OpeningBook } from '../core/openings';
import { PgnError, parseGames } from '../core/pgn';
import { judgeAttempt, type AttemptVerdict } from '../core/retry';
import {
  buildReview,
  evaluatePositions,
  refineEvaluations,
  refineTargets,
  type AnalysisSettings,
  type EvalCache,
  type GameReview,
} from '../core/review';
import { lichessRemote } from '../core/remote';
import { positionFromFen, replayUci, terminalOf, type SanMove } from '../core/chess';
import { clampMaiaElo, humanMoves, maiaMove } from '../engine/maia';
import { coachExplanation, coachLevel, type CoachResult } from './coach';
import { computeProfile, type Profile, type ProfileEntry } from '../core/profile';
import { dueExercises, exercisesFromReview, gradeAttempt, review as reviewExercise, type Exercise, type TrainingGrade } from '../core/training';
import type { MoveReview } from '../core/review';
import { exportAll, importAll, logActivity as logActivityDb } from '../db/db';
import { dayKey, type ActivityDay } from '../core/activity';
import { buildRepertoire, type Repertoire } from '../core/repertoire';
import { explore, ExplorerAuthError, ratingGroupsFor, type ExplorerResult } from '../core/explorer';
import { epdOf } from '../core/chess';
import { finishLichessLogin, lichessLogout, startLichessLogin } from './lichessAuth';
import { findThreat, type Threat } from '../core/threat';
import { annotatedPgn } from '../core/annotate';
import {
  createWoodpeckerSet,
  nextExerciseId,
  recordResult,
  startCycle,
  withoutExercises,
  type WoodpeckerSet,
} from '../core/woodpecker';
import {
  buildOpeningTree,
  expectedAt,
  pickReply,
  trainerCoverage,
  TRAINER_MAX_PLY,
  type OpeningStat,
  type OpeningTree,
} from '../core/openingTrainer';
import { GUESS_POINTS, guessIndices, guessScore, guessVerdict, type GuessResult } from '../core/guess';
import type { GuessRecord } from '../db/db';
import { endgameDrills, playEndgameMove, startEndgame, type EndgameAttempt, type EndgameDrill, type EndgameSession } from '../core/endgame';
import { chesscomUserGames, lichessUserGames } from '../core/import/fetchers';
import { positionWhiteWinPercent } from '../core/eval';
import { db, DEFAULT_APP_SETTINGS, evalCache, loadSettings, saveSettings, type Settings } from '../db/db';
import { createBrowserEngine, ENGINE_ID } from '../engine/browserEngine';

export type View = 'home' | 'review' | 'progress' | 'training' | 'woodpecker' | 'endgames' | 'guess' | 'openings' | 'settings';

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
  recent?: { platform: 'lichess' | 'chesscom'; games: Game[]; loading: boolean; /** Ids of those already analysed. */ analysed?: string[] };
  /** Several games analysed in the background, one after the other. */
  batch?: { total: number; done: number; failed: number; current?: string };
  error?: string;
  busy: boolean;
  /** Position shown: 0 = start, i = after move i. */
  cursor: number;
  orientation: Color;
  myColor?: Color;
  lineView?: LineView;
  /** Free exploration from a position of the game: moves played on the board. */
  explore?: ExploreState;
  /** Engine evaluations of explored positions, by FEN. */
  explorations: Record<string, PositionEval | 'loading' | { error: string }>;
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
  woodpecker?: WoodpeckerState;
  endgames?: EndgamesState;
  guess?: GuessState;
  openings?: OpeningsState;
  /** Today's activity, for the daily goal. */
  today?: ActivityDay;
  /** Every day with activity (loaded with the progress dashboard). */
  activity?: ActivityDay[];
}

export interface ExploreState {
  /** The game position the exploration started from (a cursor). */
  fromCursor: number;
  moves: SanMove[];
  /** Moves of the exploration shown on the board (0 = the starting position). */
  index: number;
}

/** The opening trainer, built from the player's games. */
export interface OpeningsState {
  /** Games used, by the player's colour. */
  games: Record<Color, number>;
  coverage: Record<Color, { positions: number; known: number }>;
  session?: OpeningSession;
}

export interface OpeningSession {
  color: Color;
  fen: string;
  /** Moves of both sides since the start. */
  line: SanMove[];
  status: 'your-move' | 'wrong' | 'end';
  right: number;
  wrong: number;
  /** The last move judged: the player's move and whether it was right. */
  last?: { san: string; right: boolean };
  /** On a wrong move: what was expected, and the usual move when it is an error. */
  expected?: { san: string; uci: string; usualError?: string };
  endReason?: string;
}

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
  /** Records training activity for today (and refreshes the daily goal). */
  logActivity(add: { positions?: number; games?: number }): Promise<void>;
  startTraining(theme?: string): Promise<void>;
  trainingAttempt(uci: string): Promise<void>;
  trainingHint(): void;
  trainingGiveUp(): Promise<void>;
  trainingNext(): Promise<void>;
  /** Leaves the training session for the training page (answers given so far are kept). */
  endTraining(): void;
  openWoodpecker(): Promise<void>;
  newWoodpeckerSet(size: number): Promise<void>;
  startWoodpeckerCycle(): Promise<void>;
  continueWoodpecker(): Promise<void>;
  woodpeckerAttempt(uci: string): Promise<void>;
  woodpeckerNext(): Promise<void>;
  pauseWoodpecker(): void;
  openEndgames(): Promise<void>;
  /** Opens an endgame drill of the game under review. */
  practiseEndgame(id: string): Promise<void>;
  startEndgameDrill(id: string): Promise<void>;
  endgameMove(uci: string): Promise<void>;
  endgameHint(): void;
  /** Leaves the drill (recorded as stopped when moves were played) and returns to the list. */
  leaveEndgame(): Promise<void>;
  openOpenings(): Promise<void>;
  startOpeningLine(color: Color): Promise<void>;
  openingMove(uci: string): Promise<void>;
  openingContinue(): void;
  leaveOpening(): void;
  openGuess(): Promise<void>;
  /** Starts a bundled game (by id) or a pasted PGN. */
  startGuess(source: { id: string } | { pgn: string }, side?: Color): Promise<void>;
  guessMove(uci: string): Promise<void>;
  guessNext(): Promise<void>;
  leaveGuess(): void;
  reanalyseOutdated(): Promise<void>;
  /** Analyses, in the background, the recent games that are not analysed yet. */
  analyseRecent(): Promise<void>;
  /** Analyses, in the background, the given games that are not analysed yet. */
  analyseBatch(games: Game[]): Promise<void>;
  stopBatch(): void;
  exportBackup(): Promise<void>;
  importBackup(file: File): Promise<void>;
  loadExplorer(fen: string, source: 'masters' | 'lichess'): Promise<void>;
  toggleThreats(): void;
  /** Plays a move on the review board, starting or extending an exploration. */
  exploreMove(uci: string): void;
  endExplore(): void;
  loadExploration(fen: string): Promise<void>;
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

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let openingTrees: Record<Color, OpeningTree> | undefined;
let openingStats = new Map<string, OpeningStat>();

/** Plays the opponents' replies until it is the player's turn in a known position, or the line ends. */
function advanceOpening(s: OpeningSession): OpeningSession {
  const tree = openingTrees![s.color];
  let cur = s;
  for (;;) {
    if (cur.line.length >= TRAINER_MAX_PLY) return { ...cur, status: 'end', endReason: 'Line complete: you know it up to move 8.' };
    const node = tree.get(epdOf(cur.fen));
    const turn = cur.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    if (turn === cur.color) {
      if (!expectedAt(node)) return { ...cur, status: 'end', endReason: 'End of your games in this line: you have not had this position yet.' };
      return { ...cur, status: 'your-move' };
    }
    const reply = node ? pickReply(tree, node, cur.color, openingStats) : undefined;
    const [m] = reply ? replayUci(cur.fen, [reply.uci]) : [];
    if (!m) return { ...cur, status: 'end', endReason: 'End of your games in this line.' };
    cur = { ...cur, fen: m.fenAfter, line: [...cur.line, m] };
  }
}

async function recordOpening(color: Color, epd: string, right: boolean): Promise<void> {
  const id = `${color}|${epd}`;
  const prev = openingStats.get(id) ?? { id, right: 0, wrong: 0, lastAt: 0 };
  const next = { ...prev, right: prev.right + (right ? 1 : 0), wrong: prev.wrong + (right ? 0 : 1), lastAt: Date.now() };
  openingStats.set(id, next);
  await db.openingStats.put(next);
}

let batchAbort: AbortController | undefined;
let batchEngine: UciEngine | undefined;

/** A complete analysis away from the review screen (both passes), saved with its training cards. */
async function analyseAndStore(
  game: Game,
  engine: UciEngine,
  analysisSettings: AnalysisSettings,
  settings: Settings,
  book: OpeningBook,
  cache: EvalCache,
  signal?: AbortSignal,
): Promise<GameReview> {
  const opts = { cache, ...(signal ? { signal } : {}) };
  const evals = await evaluatePositions(game, engine, analysisSettings, {
    ...opts,
    ...(settings.useLichess ? { remote: lichessRemote(browserFetch) } : {}),
  });
  const first = buildReview(game, evals, book, analysisSettings, ENGINE_ID);
  const refined = await refineEvaluations(evals, refineTargets(first), engine, analysisSettings, opts);
  const review = buildReview(game, refined, book, analysisSettings, ENGINE_ID);
  await db.reviews.put({ gameId: game.id, review });
  await addExercises(game, review, settings);
  void useStore.getState().logActivity({ games: 1 });
  return review;
}

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
  explorations: {},
  showThreats: false,
  threats: {},

  async init() {
    let settings = await loadSettings();
    set({ settings, library: await refreshLibrary().catch(() => []) });
    void db.activity.get(dayKey(new Date())).then((today) => today && set({ today })).catch(() => undefined);
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
    // A finished training session gives way to the training page.
    if (view === 'training' && get().training?.status === 'finished') set({ view, training: undefined });
    else set({ view });
  },

  endTraining() {
    set({ training: undefined, view: 'training' });
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
      explore: undefined,
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
      void get().logActivity({ games: 1 });
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
      const analysed = new Set((await db.reviews.toCollection().primaryKeys()) as string[]);
      set({ recent: { platform, games, loading: false, analysed: games.filter((g) => analysed.has(g.id)).map((g) => g.id) } });
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
    set({ cursor: Math.max(0, Math.min(n, cursor)), lineView: undefined, retry: undefined, playout: undefined, explore: undefined });
  },

  step(delta) {
    const lv = get().lineView;
    if (lv) return get().stepLine(delta);
    const ex = get().explore;
    if (ex) {
      set({ explore: { ...ex, index: Math.max(0, Math.min(ex.moves.length, ex.index + delta)) } });
      return;
    }
    get().goTo(get().cursor + delta);
  },

  exploreMove(uci) {
    const { game, cursor } = get();
    if (!game) return;
    const ex = get().explore ?? { fromCursor: cursor, moves: [], index: 0 };
    const startFen = ex.fromCursor > 0 ? game.moves[ex.fromCursor - 1]!.fenAfter : game.startFen;
    const fen = ex.index > 0 ? ex.moves[ex.index - 1]!.fenAfter : startFen;
    const [m] = replayUci(fen, [uci]);
    if (!m) return;
    // The same move as the one already explored next: just step forward.
    if (ex.moves[ex.index]?.uci === m.uci) {
      set({ explore: { ...ex, index: ex.index + 1 } });
      return;
    }
    set({ explore: { ...ex, moves: [...ex.moves.slice(0, ex.index), m], index: ex.index + 1 }, lineView: undefined });
  },

  endExplore() {
    set({ explore: undefined });
  },

  async loadExploration(fen) {
    const { explorations, settings } = get();
    if (explorations[fen]) return;
    set({ explorations: { ...explorations, [fen]: 'loading' } });
    try {
      const pos = positionFromFen(fen);
      const terminal = terminalOf(pos);
      const e: PositionEval = terminal
        ? { fen, turn: pos.turn, terminal, lines: [], depth: 0, source: 'rules' }
        : await engineForPractice().evaluate(fen, { depth: Math.max(14, settings.depth), multiPv: 1 });
      set({ explorations: { ...get().explorations, [fen]: e } });
    } catch (err) {
      set({ explorations: { ...get().explorations, [fen]: { error: errorText(err) } } });
    }
  },

  flip() {
    set({ orientation: get().orientation === 'white' ? 'black' : 'white' });
  },

  showLine(line) {
    set({ lineView: { line, index: Math.min(1, line.moves.length), playing: false }, explore: undefined });
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
      explore: undefined,
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
      explore: undefined,
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
    // The last profile stays on screen while it is recomputed (a fraction of a second).
    if (!get().profile) set({ profile: 'loading' });
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
    set({ profile: { data: computeProfile(entries), outdated, withoutMe }, repertoire: buildRepertoire(entries), activity: await db.activity.toArray() });
  },

  async logActivity(add) {
    try {
      const today = await logActivityDb(add, dayKey(new Date()));
      set({ today });
    } catch {
      // Activity is a convenience: never block training on it.
    }
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
        void get().logActivity({ positions: 1 });
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
    void get().logActivity({ positions: 1 });
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
      const session = await startEndgame(drill, engineForPractice(), endgameDepth());
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
      const next = await playEndgameMove(e.session, uci, engineForPractice(), endgameDepth());
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

  async openOpenings() {
    const settings = get().settings;
    const [games, reviews, stats] = await Promise.all([db.games.toArray(), db.reviews.toArray(), db.openingStats.toArray()]);
    const byId = new Map(reviews.map((r) => [r.gameId, r.review]));
    const entries: { game: Game; review?: GameReview; color: Color }[] = [];
    for (const game of games) {
      const color = myColorOf(game, settings);
      if (!color || game.startFen !== STANDARD_START) continue;
      const review = byId.get(game.id);
      entries.push({ game, ...(review ? { review } : {}), color });
    }
    openingTrees = { white: buildOpeningTree(entries, 'white'), black: buildOpeningTree(entries, 'black') };
    openingStats = new Map(stats.map((s) => [s.id, s]));
    set({
      view: 'openings',
      openings: {
        games: { white: entries.filter((e) => e.color === 'white').length, black: entries.filter((e) => e.color === 'black').length },
        coverage: { white: trainerCoverage(openingTrees.white, 'white', openingStats), black: trainerCoverage(openingTrees.black, 'black', openingStats) },
      },
    });
  },

  async startOpeningLine(color) {
    const o = get().openings;
    if (!o || !openingTrees) return;
    const session = advanceOpening({ color, fen: STANDARD_START, line: [], status: 'your-move', right: 0, wrong: 0 });
    set({ openings: { ...o, session } });
  },

  async openingMove(uci) {
    const o = get().openings;
    const s = o?.session;
    if (!o || !s || s.status !== 'your-move' || !openingTrees) return;
    const node = openingTrees[s.color].get(epdOf(s.fen));
    const exp = expectedAt(node);
    const [played] = replayUci(s.fen, [uci]);
    if (!exp || !played || !node) return;
    const right = exp.accepted.has(uci);
    await recordOpening(s.color, node.epd, right);
    void get().logActivity({ positions: 1 });
    if (right) {
      const next = advanceOpening({ ...s, fen: played.fenAfter, line: [...s.line, played], right: s.right + 1, last: { san: played.san, right: true }, expected: undefined });
      set({ openings: { ...o, session: next } });
    } else {
      set({
        openings: {
          ...o,
          session: { ...s, status: 'wrong', wrong: s.wrong + 1, last: { san: played.san, right: false }, expected: { ...exp.main, ...(exp.usualError ? { usualError: exp.usualError } : {}) } },
        },
      });
    }
  },

  openingContinue() {
    const o = get().openings;
    const s = o?.session;
    if (!o || !s || s.status !== 'wrong' || !s.expected) return;
    const [m] = replayUci(s.fen, [s.expected.uci]);
    if (!m) return;
    set({ openings: { ...o, session: advanceOpening({ ...s, status: 'your-move', fen: m.fenAfter, line: [...s.line, m], expected: undefined }) } });
  },

  leaveOpening() {
    const o = get().openings;
    if (!o) return;
    const coverage = openingTrees
      ? { white: trainerCoverage(openingTrees.white, 'white', openingStats), black: trainerCoverage(openingTrees.black, 'black', openingStats) }
      : o.coverage;
    set({ openings: { games: o.games, coverage } });
  },

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
        const masterGames = (await import('../data/masterGames.json')).default;
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
        await analyseAndStore(game, engine, stored.review.settings, settings, book, cache);
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

  async analyseRecent() {
    const recent = get().recent;
    if (!recent || recent.loading) return;
    await get().analyseBatch(recent.games);
  },

  async analyseBatch(games) {
    if (get().batch) return;
    const settings = get().settings;
    const analysed = new Set((await db.reviews.toCollection().primaryKeys()) as string[]);
    const todo = games.filter((g) => !analysed.has(g.id));
    if (todo.length === 0) return;
    const abort = new AbortController();
    batchAbort = abort;
    set({ batch: { total: todo.length, done: 0, failed: 0 } });
    const book = await loadOpeningBook();
    const cache = evalCache(ENGINE_ID);
    // A separate engine, so that reviewing a game meanwhile is not blocked.
    const engine = createBrowserEngine();
    batchEngine = engine;
    let failed = 0;
    try {
      for (const [i, game] of todo.entries()) {
        if (abort.signal.aborted) break;
        set({ batch: { total: todo.length, done: i, failed, current: `${game.white.name} – ${game.black.name}` } });
        try {
          await db.games.put(game);
          await analyseAndStore(game, engine, analysisSettingsOf(settings), settings, book, cache, abort.signal);
          const r = get().recent;
          if (r?.games.some((g) => g.id === game.id)) set({ recent: { ...r, analysed: [...(r.analysed ?? []), game.id] } });
        } catch {
          if (abort.signal.aborted) break;
          failed++;
        }
        set({ library: await refreshLibrary() });
      }
    } finally {
      engine.dispose();
      batchEngine = undefined;
      batchAbort = undefined;
      set({ batch: undefined, library: await refreshLibrary() });
      if (failed) set({ error: `${failed} game${failed > 1 ? 's' : ''} could not be analysed.` });
      void get().refreshDueCount();
    }
  },

  stopBatch() {
    batchAbort?.abort();
    batchEngine?.cancelAll();
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

/** Shows the next position of the Woodpecker cycle in progress (none at the end of the cycle). */
async function loadWoodpeckerItem(): Promise<void> {
  const w = useStore.getState().woodpecker;
  if (!w?.set) return;
  const id = nextExerciseId(w.set);
  if (!id) {
    useStore.setState({ woodpecker: { set: w.set, available: w.available } });
    return;
  }
  const ex = await db.exercises.get(id);
  const [game, stored] = ex ? await Promise.all([db.games.get(ex.gameId), db.reviews.get(ex.gameId)]) : [];
  const move = ex ? stored?.review.moves[ex.moveIndex] : undefined;
  const evalBefore = ex ? stored?.review.evals[ex.kind === 'threat' ? ex.moveIndex + 1 : ex.moveIndex] : undefined;
  if (!ex || !game || !move || !evalBefore) {
    // The position's game was deleted: take it out of the set and go on.
    const pruned = withoutExercises(w.set, new Set([id]));
    await db.woodpecker.put(pruned);
    useStore.setState({ woodpecker: { set: pruned, available: w.available } });
    await loadWoodpeckerItem();
    return;
  }
  useStore.setState({ woodpecker: { set: w.set, available: w.available, item: { ex, game, move, evalBefore, shownAt: Date.now(), status: 'solving' } } });
}

/** Endgames are played a little below the review depth, so that the engine answers quickly. */
const endgameDepth = () => Math.max(12, useStore.getState().settings.depth - 2);

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
