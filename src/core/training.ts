import type { Color } from './eval';
import type { Game } from './game';
import type { GameReview } from './review';
import { errorTheme } from './summary';

/**
 * Spaced repetition of the player's own mistakes (FSRS, via ts-fsrs). Each
 * mistake, miss or blunder of the player becomes a card: the position before
 * the move, to be solved again later.
 */
/** The scheduler's card, stored as is (opaque to the app apart from `dueAt`). */
export type SchedulerCard = { readonly dueAt: Date | string } & Readonly<Record<string, unknown>>;

export interface Exercise {
  /** `${gameId}:${ply}` */
  id: string;
  gameId: string;
  /** Index into the review's moves. */
  moveIndex: number;
  ply: number;
  fen: string;
  color: Color;
  playedSan: string;
  bestSan: string;
  classification: string;
  /**
   * "best" (default): find the move you should have played (`fen` is before your move).
   * "threat": find how the opponent punishes your move (`fen` is after it, the
   * opponent to move, `color` is the opponent's).
   */
  kind?: 'best' | 'threat';
  theme?: string;
  createdAt: number;
  /** Next review time (ms), mirrored from the card for indexing. */
  due: number;
  card: SchedulerCard;
  attempts: { at: number; grade: TrainingGrade; hints: number; wrong: number }[];
}

export type TrainingGrade = 'again' | 'hard' | 'good' | 'easy';

const EXERCISE_CLASSES = new Set(['mistake', 'miss', 'blunder']);

type FsrsModule = typeof import('ts-fsrs');
let fsrs: Promise<{ scheduler: Awaited<ReturnType<FsrsModule['DefaultScheduler']>>; Rating: FsrsModule['Rating'] }> | undefined;
/** The scheduler, loaded on first use (it is not needed to open the app or review a game). */
const getFsrs = () =>
  (fsrs ??= import('ts-fsrs').then(async (m) => ({
    scheduler: await m.DefaultScheduler({ enableFuzz: false, desiredRetention: 0.9 }),
    Rating: m.Rating,
  })));
const getScheduler = async () => (await getFsrs()).scheduler;
/** Loads the scheduler ahead of time (for offline use). */
export const preloadScheduler = async (): Promise<void> => {
  await getFsrs();
};

/** New exercises from a review (one per mistake, miss or blunder of `color`). */
export async function exercisesFromReview(game: Game, review: GameReview, color: Color, now = new Date()): Promise<Exercise[]> {
  const s = await getScheduler();
  const out: Exercise[] = [];
  review.moves.forEach((m, i) => {
    if (m.color !== color || !EXERCISE_CLASSES.has(m.assessment.classification)) return;
    const best = m.bestLine[0];
    const move = game.moves[i];
    if (!best || !move || best.san === m.san) return;
    const card = s.newCard({ now }) as unknown as SchedulerCard;
    const ex: Exercise = {
      id: `${game.id}:${m.ply}`,
      gameId: game.id,
      moveIndex: i,
      ply: m.ply,
      fen: move.fenBefore,
      color,
      playedSan: m.san,
      bestSan: best.san,
      classification: m.assessment.classification,
      createdAt: now.getTime(),
      due: now.getTime(),
      card,
      attempts: [],
    };
    const theme = errorTheme(m);
    if (theme) ex.theme = theme;
    out.push(ex);

    // When the move allowed a concrete punishment, a second card trains the
    // blunder check: from the position after the move, find the opponent's reply.
    const punish = m.facts.find((f) => f.kind === 'material_lost' || f.kind === 'mate_allowed');
    const reply = punish && 'line' in punish ? punish.line[0] : undefined;
    if (reply) {
      out.push({
        ...ex,
        id: `${game.id}:${m.ply}:threat`,
        kind: 'threat',
        fen: move.fenAfter,
        color: color === 'white' ? 'black' : 'white',
        bestSan: reply.san,
        card: s.newCard({ now }) as unknown as SchedulerCard,
        attempts: [],
      });
    }
  });
  return out;
}

/**
 * Grade of one training attempt: solved at once without hints is "good"
 * ("easy" if also fast), with hints or after a wrong try "hard", and a shown
 * solution or several wrong tries "again".
 */
export function gradeAttempt(a: { solved: boolean; hints: number; wrong: number; seconds: number }): TrainingGrade {
  if (!a.solved || a.wrong >= 2 || a.hints >= 3) return 'again';
  if (a.hints > 0 || a.wrong > 0) return 'hard';
  return a.seconds <= 15 ? 'easy' : 'good';
}


/** Schedules the next review of an exercise after an attempt. */
export async function review(ex: Exercise, grade: TrainingGrade, hints: number, wrong: number, now = new Date()): Promise<Exercise> {
  const { scheduler: s, Rating } = await getFsrs();
  const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
  // Stored cards come back from IndexedDB or JSON: restore the Date fields.
  const last = ex.card.lastReviewAt;
  const card = { ...ex.card, dueAt: new Date(ex.card.dueAt), lastReviewAt: last ? new Date(last as string | Date) : null };
  const result = s.review({ card: card as never, grade: RATING[grade], now });
  const due = new Date(result.card.dueAt).getTime();
  return {
    ...ex,
    card: result.card as unknown as SchedulerCard,
    due,
    attempts: [...ex.attempts, { at: now.getTime(), grade, hints, wrong }],
  };
}

/** Exercises due now, oldest due first, mixing themes. */
export function dueExercises(all: readonly Exercise[], now = Date.now(), limit = 10): Exercise[] {
  return all
    .filter((e) => e.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}
