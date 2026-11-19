import type { StateCreator } from 'zustand';
import type { Store } from '../store';
import { epdOf, replayUci, type SanMove } from '../../core/chess';
import type { Color } from '../../core/eval';
import type { Game } from '../../core/game';
import { chesscomUserGames, lichessUserGames } from '../../core/import/fetchers';
import { loadOpeningBook } from '../../core/openings';
import { colorOf, opponentReport, type OpponentReport } from '../../core/opponent';
import {
  againstOpponent,
  buildOpeningTree,
  expectedAt,
  pickReply,
  trainerCoverage,
  TRAINER_MAX_PLY,
  type OpeningStat,
  type OpeningTree,
} from '../../core/openingTrainer';
import type { GameReview } from '../../core/review';
import { db } from '../../db/db';
import { browserFetch, errorText, myColorOf, STANDARD_START } from '../shared';

/** The opening trainer, built from the player's games. */
export interface OpeningsState {
  /** Games used, by the player's colour. */
  games: Record<Color, number>;
  coverage: Record<Color, { positions: number; known: number }>;
  session?: OpeningSession;
}

export interface OpponentState {
  platform: 'lichess' | 'chesscom';
  username: string;
  loading: boolean;
  games: Game[];
  report?: OpponentReport;
}

export interface OpeningSession {
  /** Training against one opponent's moves (their username). */
  against?: string;
  color: Color;
  fen: string;
  /** Moves of both sides since the start. */
  line: SanMove[];
  status: 'your-move' | 'wrong' | 'end';
  right: number;
  wrong: number;
  /** The last move judged: the player's move and whether it was right. */
  last?: { san: string; right: boolean };
  /** On a wrong move: what was expected, and the usual move when it is an error. */
  expected?: { san: string; uci: string; usualError?: string };
  endReason?: string;
}

export interface OpeningsSlice {
  openings?: OpeningsState;
  /** Preparing for an opponent from their games. */
  opponent?: OpponentState;
  openOpenings(): Promise<void>;
  openOpponent(): void;
  /** Fetches an opponent's recent games and builds their report. */
  scoutOpponent(platform: 'lichess' | 'chesscom', username: string, max: number): Promise<void>;
  /** Opening training where the replies are the scouted opponent's moves; `color` is the player's. */
  practiseAgainst(color: Color): Promise<void>;
  startOpeningLine(color: Color): Promise<void>;
  openingMove(uci: string): Promise<void>;
  openingContinue(): void;
  leaveOpening(): void;
}

let openingTrees: Record<Color, OpeningTree> | undefined;
let openingStats = new Map<string, OpeningStat>();

/** Plays the opponents' replies until it is the player's turn in a known position, or the line ends. */
function advanceOpening(s: OpeningSession): OpeningSession {
  const tree = openingTrees![s.color];
  let cur = s;
  for (;;) {
    if (cur.line.length >= TRAINER_MAX_PLY) return { ...cur, status: 'end', endReason: 'Line complete: you know it up to move 8.' };
    const node = tree.get(epdOf(cur.fen));
    const turn = cur.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    if (turn === cur.color) {
      if (!expectedAt(node)) {
        return {
            ...cur,
            status: 'end',
            endReason: cur.against
              ? `You have never had this position in your games: this is where to prepare a move against ${cur.against}.`
              : 'End of your games in this line: you have not had this position yet.',
          };
        }
        return { ...cur, status: 'your-move' };
      }
      const reply = node ? pickReply(tree, node, cur.color, openingStats) : undefined;
      const [m] = reply ? replayUci(cur.fen, [reply.uci]) : [];
      if (!m) {
        return { ...cur, status: 'end', endReason: cur.against ? `${cur.against} never reached this position in their games.` : 'End of your games in this line.' };
      }
      cur = { ...cur, fen: m.fenAfter, line: [...cur.line, m] };
    }
  }

  async function recordOpening(color: Color, epd: string, right: boolean): Promise<void> {
    const id = `${color}|${epd}`;
    const prev = openingStats.get(id) ?? { id, right: 0, wrong: 0, lastAt: 0 };
    const next = { ...prev, right: prev.right + (right ? 1 : 0), wrong: prev.wrong + (right ? 0 : 1), lastAt: Date.now() };
    openingStats.set(id, next);
    await db.openingStats.put(next);
  }

  export const createOpeningsSlice: StateCreator<Store, [], [], OpeningsSlice> = (set, get) => {

    return {
    async openOpenings() {
      const settings = get().settings;
      const [games, reviews, stats] = await Promise.all([db.games.toArray(), db.reviews.toArray(), db.openingStats.toArray()]);
      const byId = new Map(reviews.map((r) => [r.gameId, r.review]));
      const entries: { game: Game; review?: GameReview; color: Color }[] = [];
      for (const game of games) {
        const color = myColorOf(game, settings);
        if (!color || game.startFen !== STANDARD_START) continue;
        const review = byId.get(game.id);
        entries.push({ game, ...(review ? { review } : {}), color });
      }
      openingTrees = { white: buildOpeningTree(entries, 'white'), black: buildOpeningTree(entries, 'black') };
      openingStats = new Map(stats.map((s) => [s.id, s]));
      set({
        view: 'openings',
        openings: {
          games: { white: entries.filter((e) => e.color === 'white').length, black: entries.filter((e) => e.color === 'black').length },
          coverage: { white: trainerCoverage(openingTrees.white, 'white', openingStats), black: trainerCoverage(openingTrees.black, 'black', openingStats) },
        },
      });
    },

    async startOpeningLine(color) {
      const o = get().openings;
      if (!o || !openingTrees) return;
      const session = advanceOpening({ color, fen: STANDARD_START, line: [], status: 'your-move', right: 0, wrong: 0 });
      set({ openings: { ...o, session } });
    },

    async openingMove(uci) {
      const o = get().openings;
      const s = o?.session;
      if (!o || !s || s.status !== 'your-move' || !openingTrees) return;
      const node = openingTrees[s.color].get(epdOf(s.fen));
      const exp = expectedAt(node);
      const [played] = replayUci(s.fen, [uci]);
      if (!exp || !played || !node) return;
      const right = exp.accepted.has(uci);
      await recordOpening(s.color, node.epd, right);
      void get().logActivity({ positions: 1 });
      if (right) {
        const next = advanceOpening({ ...s, fen: played.fenAfter, line: [...s.line, played], right: s.right + 1, last: { san: played.san, right: true }, expected: undefined });
        set({ openings: { ...o, session: next } });
      } else {
        set({
          openings: {
            ...o,
            session: { ...s, status: 'wrong', wrong: s.wrong + 1, last: { san: played.san, right: false }, expected: { ...exp.main, ...(exp.usualError ? { usualError: exp.usualError } : {}) } },
          },
        });
      }
    },

    openingContinue() {
      const o = get().openings;
      const s = o?.session;
      if (!o || !s || s.status !== 'wrong' || !s.expected) return;
      const [m] = replayUci(s.fen, [s.expected.uci]);
      if (!m) return;
      set({ openings: { ...o, session: advanceOpening({ ...s, status: 'your-move', fen: m.fenAfter, line: [...s.line, m], expected: undefined }) } });
    },

    leaveOpening() {
      const o = get().openings;
      if (!o) return;
      if (o.session?.against) {
        // Back to the opponent's report; the trainer is rebuilt from your games next time.
        openingTrees = undefined;
        set({ openings: undefined, view: 'opponent' });
        return;
      }
      const coverage = openingTrees
        ? { white: trainerCoverage(openingTrees.white, 'white', openingStats), black: trainerCoverage(openingTrees.black, 'black', openingStats) }
        : o.coverage;
      set({ openings: { games: o.games, coverage } });
    },

    openOpponent() {
      const s = get().settings;
      set({
        view: 'opponent',
        opponent: get().opponent ?? { platform: s.lichessUsername || !s.chesscomUsername ? 'lichess' : 'chesscom', username: '', loading: false, games: [] },
      });
    },

    async scoutOpponent(platform, username, max) {
      const name = username.trim();
      if (!name) return;
      set({ opponent: { platform, username: name, loading: true, games: [] }, error: undefined });
      try {
        const ctx = { fetch: browserFetch };
        const games = platform === 'lichess' ? await lichessUserGames(name, max, ctx) : await chesscomUserGames(name, max, ctx, 6);
        const book = await loadOpeningBook();
        set({ opponent: { platform, username: name, loading: false, games, report: opponentReport(games, name, book) } });
      } catch (err) {
        set({ opponent: { platform, username: name, loading: false, games: [] }, error: errorText(err) });
      }
    },

    async practiseAgainst(color) {
      const opp = get().opponent;
      if (!opp?.games.length) return;
      await get().openOpenings();
      const theirColor: Color = color === 'white' ? 'black' : 'white';
      const theirs = buildOpeningTree(
        opp.games.filter((g) => colorOf(g, opp.username) === theirColor && g.startFen === STANDARD_START).map((game) => ({ game, color: theirColor })),
        theirColor,
      );
      openingTrees = { ...openingTrees!, [color]: againstOpponent(openingTrees![color], theirs) };
      const o = get().openings!;
      const session = advanceOpening({ against: opp.username, color, fen: STANDARD_START, line: [], status: 'your-move', right: 0, wrong: 0 });
      set({ openings: { ...o, session } });
    },
  };
};
