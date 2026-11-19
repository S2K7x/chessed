import { describe, expect, it } from 'vitest';
import { isFiltering, matchesFilter, NO_FILTER } from './library';
import { parseGame } from './pgn';

const game = parseGame('[White "Magnus"]\n[Black "Hikaru"]\n[Result "1-0"]\n[ECO "C65"]\n[Opening "Ruy Lopez: Berlin Defense"]\n[TimeControl "180+0"]\n\n1. e4 e5 1-0');

describe('library filters', () => {
  it('matches players, openings and ECO codes, ignoring case', () => {
    expect(matchesFilter(game, { ...NO_FILTER, query: 'hika' })).toBe(true);
    expect(matchesFilter(game, { ...NO_FILTER, query: 'berlin' })).toBe(true);
    expect(matchesFilter(game, { ...NO_FILTER, query: 'c65' })).toBe(true);
    expect(matchesFilter(game, { ...NO_FILTER, query: 'sicilian' })).toBe(false);
  });

  it('combines speed and result', () => {
    expect(matchesFilter(game, { query: '', speed: 'blitz', result: '1-0' })).toBe(true);
    expect(matchesFilter(game, { query: '', speed: 'rapid', result: '' })).toBe(false);
    expect(matchesFilter(game, { query: '', speed: '', result: '0-1' })).toBe(false);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, query: '  ' })).toBe(false);
    expect(isFiltering({ ...NO_FILTER, speed: 'blitz' })).toBe(true);
  });
});
