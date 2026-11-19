import { t } from '../i18n';
import type { AttemptResult } from './retry';
import type { Color } from './eval';
import type { Game } from './game';

/**
 * "Guess the move": play through a master game from one side, guessing each
 * of that side's moves before it is shown. Scored as chessgames.com and
 * ChessBase's replay training do: the master's move earns 3 points, and a
 * different move still earns points when the engine finds it as good (2) or
 * close (1). No retry: the game's move is then played and the game goes on.
 */
export type GuessVerdict = 'master' | 'as-good' | 'close' | 'miss';

export interface GuessResult {
  /** Index into the game's moves. */
  index: number;
  guessSan: string;
  masterSan: string;
  verdict: GuessVerdict;
  points: number;
}

export const GUESS_POINTS: Readonly<Record<GuessVerdict, number>> = { master: 3, 'as-good': 2, close: 1, miss: 0 };
export const MAX_POINTS_PER_MOVE = 3;

/** Opening moves are skipped: they depend on repertoire more than on understanding. */
export const SKIPPED_MOVES = 8;

/** The indices (into `game.moves`) of the moves `side` must guess. */
export function guessIndices(game: Game, side: Color, skipMoves = SKIPPED_MOVES): number[] {
  const all = game.moves.map((m, i) => ({ m, i })).filter(({ m }) => (m.ply % 2 === 1 ? 'white' : 'black') === side);
  const after = all.filter(({ m }) => Math.ceil(m.ply / 2) > skipMoves);
  // A short game is guessed from the start.
  return (after.length >= 5 ? after : all).map(({ i }) => i);
}

/** The verdict of a guess, from the engine's judgement of it (none when it is the master's move). */
export function guessVerdict(guessUci: string, masterUci: string, engine?: AttemptResult): GuessVerdict {
  if (guessUci === masterUci) return 'master';
  if (engine === 'solved') return 'as-good';
  if (engine === 'close') return 'close';
  return 'miss';
}

export interface GuessScore {
  points: number;
  max: number;
  /** Moves guessed exactly. */
  matched: number;
  guessed: number;
  /** points / max, in %. */
  percent: number;
}

export function guessScore(results: readonly GuessResult[]): GuessScore {
  const points = results.reduce((a, r) => a + r.points, 0);
  const max = results.length * MAX_POINTS_PER_MOVE;
  return {
    points,
    max,
    matched: results.filter((r) => r.verdict === 'master').length,
    guessed: results.length,
    percent: max ? (100 * points) / max : 0,
  };
}

/** The winner's side, or White for a draw: the side usually worth following. */
export function defaultGuessSide(game: Game): Color {
  return game.result === '0-1' ? 'black' : 'white';
}

/** "Carlsen, M." → "Carlsen": master databases often write "Name, Initial." */
export function shortPlayerName(name: string): string {
  return name.split(',')[0]!.trim();
}

/** The verdict of a guess, in words. */
export const guessText = (v: GuessVerdict): string => t(`guess.verdict.${v}`);
