import { describe, expect, it } from 'vitest';
import { addDays, calendar, dayKey, streaks, type ActivityDay } from './activity';

const day = (d: string, positions = 1, games = 0): ActivityDay => ({ day: d, positions, games });

describe('activity', () => {
  it('works with local days', () => {
    expect(dayKey(new Date(2026, 10, 19, 23, 59))).toBe('2026-11-19');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts streaks, keeping today open', () => {
    const days = [day('2026-11-10'), day('2026-11-11'), day('2026-11-12'), day('2026-11-17'), day('2026-11-18')];
    expect(streaks(days, '2026-11-18')).toEqual({ current: 2, best: 3 });
    // Nothing yet today: yesterday's streak still counts.
    expect(streaks(days, '2026-11-19')).toEqual({ current: 2, best: 3 });
    // A day missed: the streak is over.
    expect(streaks(days, '2026-11-20').current).toBe(0);
    // Analysing a game counts as activity too.
    expect(streaks([day('2026-11-19', 0, 1)], '2026-11-19').current).toBe(1);
    expect(streaks([day('2026-11-19', 0, 0)], '2026-11-19').current).toBe(0);
  });

  it('lays out a Monday-first calendar with levels against the goal', () => {
    // 2026-11-19 is a Thursday.
    const cal = calendar([day('2026-11-19', 10), day('2026-11-18', 6), day('2026-11-17', 2), day('2026-11-16', 0, 1)], '2026-11-19', 10, 2);
    expect(cal).toHaveLength(2);
    expect(cal[0]![0]!.day).toBe('2026-11-09');
    const week = cal[1]!;
    expect(week.map((c) => c.level)).toEqual([1, 2, 3, 4, 0, 0, 0]);
    expect(week[4]!.future).toBe(true);
  });
});
