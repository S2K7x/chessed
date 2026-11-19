import Dexie, { type EntityTable } from 'dexie';
import { epdOf } from '../core/chess';
import type { PositionEval } from '../core/eval';
import type { Game } from '../core/game';
import type { EvalCache, GameReview } from '../core/review';
import type { Level } from '../core/coach/sheet';
import type { CoachText } from '../core/coach/verify';
import type { Exercise } from '../core/training';
import type { WoodpeckerSet } from '../core/woodpecker';
import type { EndgameDrill } from '../core/endgame';

export interface StoredEval {
  /** `${epd}|${engineId}|${multiPv}` */
  key: string;
  eval: PositionEval;
  depth: number;
}

export interface StoredReview {
  gameId: string;
  review: GameReview;
}

export interface StoredExplanation {
  /** `${fenBefore}|${uci}|${classifierVersion}|${promptVersion}|${level}` */
  key: string;
  text: CoachText;
  model?: string;
  createdAt: number;
}

export interface Settings {
  key: 'settings';
  lichessUsername: string;
  chesscomUsername: string;
  depth: number;
  /** "quick": the depth above, MultiPV 2. "deep": at least depth 20, MultiPV 3. */
  profile: 'quick' | 'deep';
  /** Use Lichess tablebases and cloud evaluations (sends those positions to lichess.org). */
  useLichess: boolean;
  theme: 'system' | 'light' | 'dark';
  /** Coach register: from the game's rating, or fixed. */
  level: 'auto' | Level;
  /** Language-model coach (needs the proxy's /coach endpoint and its token). */
  llmCoach: boolean;
  coachUrl: string;
  coachToken: string;
  /** Lichess OAuth token (opening explorer). */
  lichessToken: string;
}

export const DEFAULT_APP_SETTINGS: Settings = {
  key: 'settings',
  lichessUsername: '',
  chesscomUsername: '',
  depth: 14,
  profile: 'quick',
  useLichess: true,
  theme: 'system',
  level: 'auto',
  llmCoach: false,
  coachUrl: import.meta.env.VITE_COACH_URL ?? '',
  coachToken: '',
  lichessToken: '',
};

class CoachDb extends Dexie {
  games!: EntityTable<Game, 'id'>;
  reviews!: EntityTable<StoredReview, 'gameId'>;
  evals!: EntityTable<StoredEval, 'key'>;
  settings!: EntityTable<Settings, 'key'>;
  explanations!: EntityTable<StoredExplanation, 'key'>;
  exercises!: EntityTable<Exercise, 'id'>;
  woodpecker!: EntityTable<WoodpeckerSet, 'id'>;
  endgames!: EntityTable<EndgameDrill, 'id'>;

  constructor() {
    super('chess-coach');
    this.version(1).stores({
      games: 'id, importedAt, source, date',
      reviews: 'gameId',
      evals: 'key',
      settings: 'key',
    });
    this.version(2).stores({ explanations: 'key, createdAt' });
    this.version(3).stores({ exercises: 'id, due, gameId' });
    this.version(4).stores({ woodpecker: 'id, createdAt' });
    this.version(5).stores({ endgames: 'id, gameId' });
  }
}

export const db = new CoachDb();

export function evalCache(engineId: string): EvalCache {
  const keyOf = (fen: string, multiPv: number) => `${epdOf(fen)}|${engineId}|${multiPv}`;
  return {
    async get(fen, minDepth, multiPv) {
      const hit = await db.evals.get(keyOf(fen, multiPv));
      if (!hit || hit.depth < minDepth) return undefined;
      // Stored under the EPD: restore this game's move counters.
      return { ...hit.eval, fen };
    },
    async put(e, multiPv) {
      await db.evals.put({ key: keyOf(e.fen, multiPv), eval: e, depth: e.depth });
    },
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_APP_SETTINGS, ...((await db.settings.get('settings')) ?? {}) };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.settings.put(s);
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported: data stays best-effort.
  }
}

/** Everything the user owns, as one JSON document (the coach token is left out). */
export async function exportAll(): Promise<string> {
  const settings = await loadSettings();
  const data = {
    format: 'chess-coach-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, coachToken: '', lichessToken: '' },
    games: await db.games.toArray(),
    reviews: await db.reviews.toArray(),
    exercises: await db.exercises.toArray(),
    woodpecker: await db.woodpecker.toArray(),
    endgames: await db.endgames.toArray(),
  };
  return JSON.stringify(data);
}

/** Merges a backup into the database. Returns the number of games imported. */
export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json) as {
    format?: string;
    games?: Game[];
    reviews?: StoredReview[];
    exercises?: Exercise[];
    woodpecker?: WoodpeckerSet[];
    endgames?: EndgameDrill[];
  };
  if (data.format !== 'chess-coach-backup') throw new Error('This file is not a Chess Coach backup.');
  await db.transaction('rw', [db.games, db.reviews, db.exercises, db.woodpecker, db.endgames], async () => {
    if (data.games) await db.games.bulkPut(data.games);
    if (data.reviews) await db.reviews.bulkPut(data.reviews);
    if (data.exercises) await db.exercises.bulkPut(data.exercises);
    if (data.woodpecker) await db.woodpecker.bulkPut(data.woodpecker);
    if (data.endgames) await db.endgames.bulkPut(data.endgames);
  });
  return data.games?.length ?? 0;
}
