import { DefaultScheduler, Rating } from 'ts-fsrs';
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
  theme?: string;
  createdAt: number;
  /** Next review time (ms), mirrored from the card for indexing. */
  due: number;
  card: SchedulerCard;
  attempts: { at: number; grade: TrainingGrade; hints: number; wrong: number }[];
}

export type TrainingGrade = 'again' | 'hard' | 'good' | 'easy';

const EXERCISE_CLASSES = new Set(['mistake', 'miss', 'blunder']);

let scheduler: ReturnType<typeof DefaultScheduler> | undefined;
const getScheduler = () => (scheduler ??= DefaultScheduler({ enableFuzz: false, desiredRetention: 0.9 }));

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

const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

/** Schedules the next review of an exercise after an attempt. */
export async function review(ex: Exercise, grade: TrainingGrade, hints: number, wrong: number, now = new Date()): Promise<Exercise> {
  const s = await getScheduler();
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
