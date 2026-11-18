import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfo } from './uci';

describe('UCI parsing', () => {
  it('parses a MultiPV info line', () => {
    const info = parseInfo('info depth 10 seldepth 17 multipv 2 score cp 21 nodes 28310 nps 410289 hashfull 5 time 69 pv d2d4 e5d4 f3d4');
    expect(info).toEqual({ depth: 10, seldepth: 17, multipv: 2, score: { cp: 21 }, nodes: 28310, pv: ['d2d4', 'e5d4', 'f3d4'] });
  });
  it('parses mates and bounds', () => {
    expect(parseInfo('info depth 5 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
    expect(parseInfo('info depth 5 score cp 40 lowerbound pv a1a2')?.bound).toBe('lower');
  });
  it('ignores lines without a score or pv', () => {
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeUndefined();
    expect(parseInfo('info string NNUE evaluation enabled')).toBeUndefined();
  });
  it('parses bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('readyok')).toBeUndefined();
  });
});
