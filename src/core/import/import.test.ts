import { describe, expect, it } from 'vitest';
import { replayUci } from '../chess';
import { START } from '../testing/fixtures';
import { importGame, ImportError, type Fetch } from './fetchers';
import { decodeTcn } from './tcn';
import { parseGameUrl } from './urls';

describe('game links', () => {
  it('recognises Lichess links', () => {
    expect(parseGameUrl('https://lichess.org/abcdEFGH')).toEqual({ platform: 'lichess', id: 'abcdEFGH' });
    expect(parseGameUrl('https://lichess.org/abcdEFGH1234')).toEqual({ platform: 'lichess', id: 'abcdEFGH' });
    expect(parseGameUrl('https://lichess.org/abcdEFGH/black#32')).toEqual({ platform: 'lichess', id: 'abcdEFGH' });
    expect(parseGameUrl('https://lichess.org/game/export/abcdEFGH')).toEqual({ platform: 'lichess', id: 'abcdEFGH' });
    expect(parseGameUrl('https://lichess.org/@/someone')).toBeUndefined();
  });
  it('recognises Chess.com links', () => {
    expect(parseGameUrl('https://www.chess.com/game/live/171498926638')).toEqual({ platform: 'chesscom', id: '171498926638', type: 'live' });
    expect(parseGameUrl('https://www.chess.com/game/daily/123')).toEqual({ platform: 'chesscom', id: '123', type: 'daily' });
    expect(parseGameUrl('https://www.chess.com/analysis/game/live/987/analysis?tab=review')).toEqual({ platform: 'chesscom', id: '987', type: 'live' });
    expect(parseGameUrl('https://www.chess.com/member/someone')).toBeUndefined();
  });
  it('ignores non-URLs', () => {
    expect(parseGameUrl('1. e4 e5')).toBeUndefined();
  });
});

describe('TCN decoding', () => {
  it('decodes a real Chess.com move list into legal moves', () => {
    // Game 171498926638 (33 plies), from Chess.com's callback endpoint.
    const ucis = decodeTcn('nDZJjz5Qbs0SmuQzlB!TcqzQfHWOHy9qoEXHyrHzry6ZEMzsMT7TdN2UNMTMDMQzgv');
    expect(ucis).toHaveLength(33);
    expect(replayUci(START, ucis)).toHaveLength(33);
  });
  it('decodes promotions', () => {
    // "~" and "}" ... encode a pawn on the 7th rank promoting straight ahead.
    const [m] = decodeTcn('0~');
    expect(m).toMatch(/^[a-h]7[a-h]8[qnrb]$/);
  });
});

const respond = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));

describe('importGame', () => {
  it('fetches a Lichess game as PGN', async () => {
    const urls: string[] = [];
    const fetch: Fetch = (url) => {
      urls.push(url);
      return respond('[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. e4 e5 *');
    };
    const g = await importGame('https://lichess.org/abcdEFGH', { fetch });
    expect(urls[0]).toContain('/game/export/abcdEFGH');
    expect(g.id).toBe('lichess:abcdEFGH');
    expect(g.source).toBe('lichess');
  });

  it('finds a Chess.com game in the player archive', async () => {
    const fetch: Fetch = (url) =>
      url.includes('/games/')
        ? respond(JSON.stringify({ games: [{ url: 'https://www.chess.com/game/live/42', pgn: '[White "me"]\n[Black "you"]\n\n1. d4 d5 *' }] }))
        : respond('{}', 404);
    const g = await importGame('https://www.chess.com/game/live/42', { fetch, chesscomUsernames: ['me'] });
    expect(g.id).toBe('chesscom:42');
    expect(g.moves).toHaveLength(2);
  });

  it('explains what to do when a Chess.com game cannot be located', async () => {
    const fetch: Fetch = () => respond(JSON.stringify({ games: [] }));
    await expect(importGame('https://www.chess.com/game/live/42', { fetch })).rejects.toThrow(ImportError);
  });

  it('parses pasted PGN', async () => {
    const g = await importGame('1. e4 e5 2. Nf3 *', { fetch: () => respond('', 500) });
    expect(g.moves).toHaveLength(3);
  });
});
