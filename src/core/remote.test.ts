import { describe, expect, it } from 'vitest';
import { positionWhiteWinPercent } from './eval';
import { cloudToEval, lichessRemote, tablebaseToEval } from './remote';

// Real responses from tablebase.lichess.ovh and lichess.org/api/cloud-eval (trimmed).
const TB_FEN = '4k3/6KP/8/8/8/8/7p/8 w - - 0 1';
const TB = {
  category: 'win' as const,
  dtm: 17,
  moves: [
    { uci: 'h7h8q', category: 'loss' as const, dtm: -16 },
    { uci: 'g7g8', category: 'draw' as const, dtm: null },
  ],
};
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const CLOUD = { depth: 70, pvs: [{ moves: 'e7e5 g1f3 b8c6', cp: 18 }, { moves: 'c7c5 g1f3', cp: 25 }] };

describe('tablebase conversion', () => {
  it('turns a won position into a mate score for the side to move', () => {
    const e = tablebaseToEval(TB_FEN, TB, 2)!;
    expect(e.source).toBe('tablebase');
    expect(e.lines[0]).toMatchObject({ pv: ['h7h8q'], score: { mate: 9 } });
    expect(e.lines[1]).toMatchObject({ pv: ['g7g8'], score: { cp: 0 } });
    expect(positionWhiteWinPercent(e)).toBeGreaterThan(95);
  });

  it('keeps White’s point of view when Black is to move', () => {
    const black = 'K7/8/8/8/8/8/7p/4k3 b - - 0 1';
    const e = tablebaseToEval(black, { category: 'win', dtm: 5, moves: [{ uci: 'h2h1q', category: 'loss', dtm: -4 }] }, 1)!;
    expect(e.lines[0]!.score.mate).toBeLessThan(0);
  });

  it('rejects illegal moves', () => {
    expect(tablebaseToEval(TB_FEN, { ...TB, moves: [{ uci: 'a1a8', category: 'loss', dtm: -3 }] }, 1)).toBeUndefined();
  });
});

describe('cloud evaluation conversion', () => {
  it('reads scores from White’s point of view', () => {
    const e = cloudToEval(AFTER_E4, CLOUD)!;
    expect(e.turn).toBe('black');
    expect(e.lines[0]!.score.cp).toBe(18);
    expect(positionWhiteWinPercent(e)).toBeGreaterThan(50);
  });
});

describe('lichessRemote', () => {
  it('uses the tablebase for small endgames and the cloud only early', async () => {
    const urls: string[] = [];
    const remote = lichessRemote(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes('tablebase') ? TB : CLOUD));
    });
    expect((await remote.get(TB_FEN, 80, { depth: 14, multiPv: 2 }))?.source).toBe('tablebase');
    expect((await remote.get(AFTER_E4, 1, { depth: 14, multiPv: 2 }))?.source).toBe('cloud');
    expect(await remote.get(AFTER_E4, 40, { depth: 14, multiPv: 2 })).toBeUndefined();
    expect(urls).toHaveLength(2);
  });

  it('falls back when the cloud evaluation is too shallow or missing', async () => {
    const shallow = lichessRemote(async () => new Response(JSON.stringify({ ...CLOUD, depth: 10 })));
    expect(await shallow.get(AFTER_E4, 1, { depth: 14, multiPv: 2 })).toBeUndefined();
    const missing = lichessRemote(async () => new Response('{}', { status: 404 }));
    expect(await missing.get(AFTER_E4, 1, { depth: 14, multiPv: 2 })).toBeUndefined();
    const offline = lichessRemote(async () => {
      throw new TypeError('network');
    });
    expect(await offline.get(AFTER_E4, 1, { depth: 14, multiPv: 2 })).toBeUndefined();
  });
});
