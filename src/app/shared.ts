import type { UciEngine } from '../core/engine';
import type { Color } from '../core/eval';
import type { Game } from '../core/game';
import { ImportError } from '../core/import/fetchers';
import { PgnError } from '../core/pgn';
import type { Settings } from '../db/db';
import { createBrowserEngine } from '../engine/browserEngine';

/** Helpers shared by the store and its slices. */

let practiceEngine: UciEngine | undefined;
/** The engine for practice (retries, training, exploration), separate from the analysis engine. */
export const engineForPractice = () => {
  if (!practiceEngine || practiceEngine.failed) practiceEngine = createBrowserEngine();
  return practiceEngine;
};

export const browserFetch = (url: string, init?: RequestInit) => fetch(url, init);

export const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The player's colour in a game, from their usernames in Settings. */
export function myColorOf(game: Game, s: Settings): Color | undefined {
  const names = [s.lichessUsername, s.chesscomUsername].map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (names.includes(game.white.name.toLowerCase())) return 'white';
  if (names.includes(game.black.name.toLowerCase())) return 'black';
  return undefined;
}

/** A message for the user from any error. */
export const errorText = (err: unknown): string => {
  if (err instanceof ImportError || err instanceof PgnError) return err.message;
  if (err instanceof TypeError) {
    // A lazily loaded part of the app (offline, or the local server stopped).
    if (/dynamically imported module|importing a module script/i.test(err.message)) {
      return 'Part of the app could not be loaded. Check your connection (or that Chess Coach is still running), then reload the page.';
    }
    return 'Network error: the game could not be downloaded. Check your connection, or paste the PGN.';
  }
  return err instanceof Error ? err.message : String(err);
};
