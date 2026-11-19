import { t } from '../i18n';
import { ERROR_CLASSES } from './classify';
import { povScore, type Color } from './eval';
import { tacticalOpportunity } from './facts/opportunity';
import type { Game } from './game';
import type { Phase } from './phase';
import type { GameReview, MoveReview } from './review';
import { errorTheme } from './summary';

/**
 * The player's profile across games: what they miss, what they allow, where
 * they lose points, and how it changes. Rates are per 100 opportunities so
 * that a theme met often is not mistaken for a weakness.
 */
export interface ProfileEntry {
  game: Game;
  review: GameReview;
  color: Color;
}

export type ThemeKind = 'missed' | 'allowed' | 'positional';

export interface ThemeStat {
  theme: string;
  kind: ThemeKind;
  errors: number;
  /** Positions where the theme could happen: tactics available (missed) or moves played (allowed, positional). */
  opportunities: number;
  /** Errors per 100 opportunities. */
  rate: number;
  /** Average win-% lost by these errors. */
  avgCost: number;
  previousRate?: number;
  recentRate?: number;
  /** Errors in the older window, when trends are available. */
  previousErrors?: number;
  /** A lesson attached to one of these errors. */
  lesson?: string;
}

export interface Profile {
  games: number;
  moves: number;
  results: { wins: number; draws: number; losses: number };
  accuracy?: number;
  accuracyByPhase: Partial<Record<Phase, number>>;
  /** One point per game, oldest first. */
  accuracyTrend: { gameId: string; date: string; accuracy: number; label: string }[];
  /** Mistakes, misses and blunders per 100 moves. */
  errorsPer100: number;
  themes: ThemeStat[];
  openings: { name: string; color: Color; games: number; score: number; avgLossAfterBook?: number }[];
  /** Errors made with little time left, among errors whose clock is known. */
  timeTrouble: { errors: number; totalErrors: number; withClock: number };
  /** Serious errors played much faster than the player's usual pace, among serious errors with clocks. */
  fastErrors: { errors: number; withClock: number };
  /** Up to three themes to work on first: rate × average cost. */
  priorities: ThemeStat[];
  /** Themes whose rate fell by at least half between the older and recent games. */
  improved: ThemeStat[];
  /** Window sizes used for trends. */
  windows?: { previous: number; recent: number };
}

const SERIOUS = new Set(['mistake', 'miss', 'blunder']);
const TREND_WINDOW = 20;
const MIN_TREND_GAMES = 6;

const dateOf = (e: ProfileEntry) => e.game.date ?? new Date(e.game.importedAt).toISOString().slice(0, 10);

export { tacticalOpportunity } from './facts/opportunity';

/**
 * The tactical opportunity before move `i`: stored at analysis time, or
 * computed (and kept for the session) for reviews made before it was stored.
 */
const opportunityMemo = new Map<string, (string | null)[]>();
function opportunityOf(review: GameReview, i: number): string | undefined {
  const m = review.moves[i]!;
  if (m.opportunity !== undefined) return m.opportunity ?? undefined;
  const key = `${review.createdAt}|${review.engineId}|${review.moves.length}|${review.moves[0]?.uci ?? ''}`;
  let memo = opportunityMemo.get(key);
  if (!memo) {
    memo = [];
    opportunityMemo.set(key, memo);
  }
  if (memo[i] === undefined) {
    const before = review.evals[i];
    memo[i] = (before ? tacticalOpportunity(m, before) : undefined) ?? null;
  }
  return memo[i] ?? undefined;
}

interface Counter {
  kind: ThemeKind;
  errors: number;
  opportunities: number;
  cost: number;
  lesson?: string;
}

function themeCounts(entries: ProfileEntry[]): Map<string, Counter> {
  const counts = new Map<string, Counter>();
  const bump = (theme: string, kind: ThemeKind, field: 'errors' | 'opportunities', cost = 0, lesson?: string) => {
    const c = counts.get(theme) ?? { kind, errors: 0, opportunities: 0, cost: 0 };
    c[field]++;
    c.cost += cost;
    if (lesson && !c.lesson) c.lesson = lesson;
    counts.set(theme, c);
  };
  for (const { review, color } of entries) {
    const allowedErrors: [string, MoveReview][] = [];
    const positionalErrors: [string, MoveReview][] = [];
    review.moves.forEach((m, i) => {
      if (m.color !== color) return;
      const c = m.assessment.classification;
      if (c === 'book' || c === 'forced') return;
      const isError = ERROR_CLASSES.has(c);
      const opportunity = opportunityOf(review, i);
      if (opportunity) {
        bump(opportunity, 'missed', 'opportunities');
        if (isError) bump(opportunity, 'missed', 'errors', m.assessment.winLoss, m.explanation.lesson);
        return;
      }
      if (!SERIOUS.has(c) && c !== 'inaccuracy') return;
      const theme = errorTheme(m);
      if (!theme) return;
      if (m.errorKind === 'positional') positionalErrors.push([theme, m]);
      else allowedErrors.push([theme, m]);
    });
    // Allowed and positional themes: every move played is an opportunity to err
    // (their denominator is set from the move count in toStats).
    for (const [theme, m] of allowedErrors) bump(theme, 'allowed', 'errors', m.assessment.winLoss, m.explanation.lesson);
    for (const [theme, m] of positionalErrors) bump(theme, 'positional', 'errors', m.assessment.winLoss, m.explanation.lesson);
  }
  return counts;
}

function toStats(counts: Map<string, Counter>, totalMoves: number): ThemeStat[] {
  return [...counts.entries()]
    .map(([theme, c]) => {
      const opportunities = c.kind === 'missed' ? c.opportunities : totalMoves;
      const s: ThemeStat = {
        theme,
        kind: c.kind,
        errors: c.errors,
        opportunities,
        rate: opportunities ? (100 * c.errors) / opportunities : 0,
        avgCost: c.errors ? c.cost / c.errors : 0,
      };
      if (c.lesson) s.lesson = c.lesson;
      return s;
    })
    .sort((a, b) => b.rate * b.avgCost - a.rate * a.avgCost);
}

const ownMoveCount = (entries: ProfileEntry[]) =>
  entries.reduce(
    (n, e) => n + e.review.moves.filter((m) => m.color === e.color && m.assessment.classification !== 'book' && m.assessment.classification !== 'forced').length,
    0,
  );

export function computeProfile(input: ProfileEntry[]): Profile {
  const entries = [...input].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.game.importedAt - b.game.importedAt);
  const results = { wins: 0, draws: 0, losses: 0 };
  for (const { game, color } of entries) {
    if (game.result === '1/2-1/2') results.draws++;
    else if ((game.result === '1-0' && color === 'white') || (game.result === '0-1' && color === 'black')) results.wins++;
    else if (game.result === '1-0' || game.result === '0-1') results.losses++;
  }

  const accuracyTrend = entries
    .map((e) => ({
      gameId: e.game.id,
      date: dateOf(e),
      accuracy: e.review.accuracy[e.color],
      label: `${e.game.white.name} – ${e.game.black.name}`,
    }))
    .filter((p): p is { gameId: string; date: string; accuracy: number; label: string } => p.accuracy !== undefined);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

  const accuracyByPhase: Profile['accuracyByPhase'] = {};
  for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
    const v = mean(entries.map((e) => e.review.accuracyByPhase[phase]?.[e.color]).filter((x): x is number => x !== undefined));
    if (v !== undefined) accuracyByPhase[phase] = v;
  }

  const moves = ownMoveCount(entries);
  let serious = 0;
  let errors = 0;
  let inTrouble = 0;
  let withClock = 0;
  let fastSerious = 0;
  let seriousWithClock = 0;
  for (const { review, color } of entries) {
    for (const m of review.moves) {
      if (m.color !== color) continue;
      if (SERIOUS.has(m.assessment.classification)) {
        serious++;
        if (m.timeSpentMs !== undefined) seriousWithClock++;
        if (m.fast) fastSerious++;
      }
      if (ERROR_CLASSES.has(m.assessment.classification)) {
        errors++;
        if (m.clockMs !== undefined) withClock++;
        if (m.timeTrouble) inTrouble++;
      }
    }
  }

  const themes = toStats(themeCounts(entries), moves);

  // Trends: compare the most recent games with the ones before.
  let windows: Profile['windows'];
  if (entries.length >= MIN_TREND_GAMES) {
    const size = Math.min(TREND_WINDOW, Math.floor(entries.length / 2));
    const recent = entries.slice(-size);
    const previous = entries.slice(-2 * size, -size);
    windows = { previous: previous.length, recent: recent.length };
    const before = new Map(toStats(themeCounts(previous), ownMoveCount(previous)).map((t) => [`${t.kind}|${t.theme}`, t]));
    const after = new Map(toStats(themeCounts(recent), ownMoveCount(recent)).map((t) => [`${t.kind}|${t.theme}`, t]));
    for (const t of themes) {
      const k = `${t.kind}|${t.theme}`;
      t.previousRate = before.get(k)?.rate ?? 0;
      t.previousErrors = before.get(k)?.errors ?? 0;
      t.recentRate = after.get(k)?.rate ?? 0;
    }
  }

  const improved = themes.filter(
    (t) => (t.previousErrors ?? 0) >= 2 && t.recentRate !== undefined && t.recentRate <= (t.previousRate ?? 0) / 2,
  );

  const priorities = themes.filter((t) => t.errors >= 2).slice(0, 3);

  // Openings, from the player's side.
  const byOpening = new Map<string, { name: string; color: Color; games: number; points: number; losses: number[] }>();
  for (const { game, review, color } of entries) {
    const name = review.opening?.name ?? game.openingName ?? t('profile.unknownOpening');
    const key = `${color}|${name}`;
    const o = byOpening.get(key) ?? { name, color, games: 0, points: 0, losses: [] };
    o.games++;
    o.points += game.result === '1/2-1/2' ? 0.5 : (game.result === '1-0') === (color === 'white') && game.result !== '*' ? 1 : 0;
    const lastBook = review.opening?.lastBookPly ?? 0;
    const after = review.moves.filter((m) => m.color === color && m.ply > lastBook).slice(0, 5);
    if (after.length) o.losses.push(after.reduce((a, m) => a + m.assessment.winLoss, 0) / after.length);
    byOpening.set(key, o);
  }
  const openings = [...byOpening.values()]
    .map((o) => {
      const avg = mean(o.losses);
      return { name: o.name, color: o.color, games: o.games, score: o.points / o.games, ...(avg !== undefined ? { avgLossAfterBook: avg } : {}) };
    })
    .sort((a, b) => b.games - a.games);

  const profile: Profile = {
    games: entries.length,
    moves,
    results,
    accuracyByPhase,
    accuracyTrend,
    errorsPer100: moves ? (100 * serious) / moves : 0,
    themes,
    openings,
    timeTrouble: { errors: inTrouble, totalErrors: errors, withClock },
    fastErrors: { errors: fastSerious, withClock: seriousWithClock },
    priorities,
    improved,
  };
  const overall = mean(accuracyTrend.map((p) => p.accuracy));
  if (overall !== undefined) profile.accuracy = overall;
  if (windows) profile.windows = windows;
  return profile;
}
