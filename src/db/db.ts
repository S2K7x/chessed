import Dexie, { type EntityTable } from 'dexie';
import { epdOf } from '../core/chess';
import type { PositionEval } from '../core/eval';
import type { Game } from '../core/game';
import type { EvalCache, GameReview } from '../core/review';

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

export interface Settings {
  key: 'settings';
  lichessUsername: string;
  chesscomUsername: string;
  depth: number;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_APP_SETTINGS: Settings = {
  key: 'settings',
  lichessUsername: '',
  chesscomUsername: '',
  depth: 14,
  theme: 'system',
};

class CoachDb extends Dexie {
  games!: EntityTable<Game, 'id'>;
  reviews!: EntityTable<StoredReview, 'gameId'>;
  evals!: EntityTable<StoredEval, 'key'>;
  settings!: EntityTable<Settings, 'key'>;

  constructor() {
    super('chess-coach');
    this.version(1).stores({
      games: 'id, importedAt, source, date',
      reviews: 'gameId',
      evals: 'key',
      settings: 'key',
    });
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
