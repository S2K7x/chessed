/**
 * Training activity day by day: a streak, a calendar and a daily goal. Regular
 * practice matters more than long sessions, so the app shows it.
 */
export interface ActivityDay {
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Positions answered in any training mode. */
  positions: number;
  /** Games analysed. */
  games: number;
}

export const DEFAULT_DAILY_GOAL = 10;

/** The local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day `n` days after `day` (negative: before). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + n));
}

const active = (a: ActivityDay | undefined) => !!a && a.positions + a.games > 0;

/**
 * Consecutive active days ending today, or yesterday when today has no
 * activity yet (the streak is not lost before the day is over), and the best
 * run ever.
 */
export function streaks(days: readonly ActivityDay[], today: string): { current: number; best: number } {
  const byDay = new Map(days.map((d) => [d.day, d]));
  let start = active(byDay.get(today)) ? today : addDays(today, -1);
  let current = 0;
  while (active(byDay.get(start))) {
    current++;
    start = addDays(start, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | undefined;
  for (const d of [...days].filter(active).sort((a, b) => a.day.localeCompare(b.day))) {
    run = prev && addDays(prev, 1) === d.day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d.day;
  }
  return { current, best: Math.max(best, current) };
}

export interface CalendarCell {
  day: string;
  positions: number;
  games: number;
  /** 0 (nothing) to 4 (the daily goal reached or more). */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** The last `weeks` weeks, Monday first, one column per week. */
export function calendar(days: readonly ActivityDay[], today: string, goal = DEFAULT_DAILY_GOAL, weeks = 12): CalendarCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const firstMonday = addDays(today, -weekday - 7 * (weeks - 1));
  const out: CalendarCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(firstMonday, 7 * w + i);
      const a = byDay.get(day);
      const positions = a?.positions ?? 0;
      const games = a?.games ?? 0;
      const share = positions / Math.max(1, goal);
      const level: CalendarCell['level'] = positions + games === 0 ? 0 : share >= 1 ? 4 : share >= 0.5 ? 3 : share > 0 ? 2 : 1;
      col.push({ day, positions, games, level, future: day > today });
    }
    out.push(col);
  }
  return out;
}
