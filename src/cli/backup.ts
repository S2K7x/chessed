import type { Game } from '../core/game';
import type { GameReview } from '../core/review';
import type { Exercise } from '../core/training';

/** The backup format imported by Settings → Your data → Import a backup. */
export interface Backup {
  format: 'chess-coach-backup';
  version: 1;
  exportedAt: string;
  games: Game[];
  reviews: { gameId: string; review: GameReview }[];
  exercises: Exercise[];
}

export function makeBackup(entries: { game: Game; review: GameReview }[], exercises: Exercise[]): Backup {
  return {
    format: 'chess-coach-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    games: entries.map((e) => e.game),
    reviews: entries.map((e) => ({ gameId: e.game.id, review: e.review })),
    exercises,
  };
}
