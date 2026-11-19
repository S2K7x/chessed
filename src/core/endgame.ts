import { t } from '../i18n';
import { epdOf, legalUci, positionFromFen, replayUci, terminalOf, type SanMove } from './chess';
import type { Evaluator } from './engine';
import { positionPovWinPercent, type Color, type PositionEval } from './eval';
import type { Game } from './game';
import type { GameReview } from './review';

/**
 * Endgame drills from the player's own games: an endgame they were winning
 * and did not win, or a drawn endgame they lost. The player plays the position
 * out against Stockfish until they convert (or hold), or let it slip again.
 */
export type EndgameGoal = 'win' | 'draw';

export interface EndgameAttempt {
  at: number;
  result: 'success' | 'failed' | 'stopped';
  /** Moves played by the player. */
  moves: number;
  hints: number;
}

export interface EndgameDrill {
  /** `${gameId}:${ply}` */
  id: string;
  gameId: string;
  moveIndex: number;
  ply: number;
  /** The position before the player's move, the player to move. */
  fen: string;
  color: Color;
  goal: EndgameGoal;
  /** The player's winning chances there, in %. */
  winBefore: number;
  /** What happened in the game: the move that let it slip. */
  playedSan: string;
  createdAt: number;
  attempts: EndgameAttempt[];
}

/** Winning chances (%) from which an endgame counts as won, and below which a win has slipped. */
export const WIN_FROM = 75;
export const WIN_LOST_BELOW = 60;
/** A balanced endgame, and the level below which it is lost. */
export const DRAW_RANGE: readonly [number, number] = [35, 65];
export const DRAW_LOST_BELOW = 25;
/** Holding a draw this many moves against the engine counts as a success. */
export const HOLD_MOVES = 25;

/**
 * The drills of a game for `color`: at most one thrown win (in a game not won)
 * and one lost draw (in a game lost). The position chosen is the last one that
 * was still won (or drawn) before the move that let it go.
 */
export function endgameDrills(game: Game, review: GameReview, color: Color, now = Date.now()): EndgameDrill[] {
  const won = (color === 'white' && game.result === '1-0') || (color === 'black' && game.result === '0-1');
  const lost = (color === 'white' && game.result === '0-1') || (color === 'black' && game.result === '1-0');
  const out: EndgameDrill[] = [];
  const found = { win: false, draw: false };
  let lastWon: number | undefined;
  let lastDrawn: number | undefined;
  review.moves.forEach((m, i) => {
    if (m.color !== color || m.phase !== 'endgame') return;
    const { winBefore, winAfter } = m.assessment;
    if (winBefore >= WIN_FROM) lastWon = i;
    if (winBefore >= DRAW_RANGE[0] && winBefore <= DRAW_RANGE[1]) lastDrawn = i;
    const make = (idx: number, goal: EndgameGoal) => {
      const at = review.moves[idx]!;
      const move = game.moves[idx];
      if (!move) return;
      found[goal] = true;
      out.push({
        id: `${game.id}:${at.ply}`,
        gameId: game.id,
        moveIndex: idx,
        ply: at.ply,
        fen: move.fenBefore,
        color,
        goal,
        winBefore: at.assessment.winBefore,
        playedSan: at.san,
        createdAt: now,
        attempts: [],
      });
    };
    if (!won && !found.win && lastWon !== undefined && winAfter < WIN_LOST_BELOW) make(lastWon, 'win');
    if (lost && !found.draw && lastDrawn !== undefined && winBefore < WIN_FROM && winAfter < DRAW_LOST_BELOW) make(lastDrawn, 'draw');
  });
  return out;
}

/** "R+3P vs R+2P": material of the player, then of the opponent. */
export function materialText(fen: string, color: Color): string {
  const board = fen.split(' ')[0]!;
  const side = (white: boolean) => {
    const parts: string[] = [];
    // Piece letters of the current language: "QRBNPK" in English, "DTFCPR" in French.
    const names = t('material.letters');
    ['q', 'r', 'b', 'n'].forEach((letter, i) => {
      const n = [...board].filter((c) => c === (white ? letter.toUpperCase() : letter)).length;
      for (let k = 0; k < n; k++) parts.push(names[i]!);
    });
    const pawns = [...board].filter((c) => c === (white ? 'P' : 'p')).length;
    if (pawns) parts.push(`${pawns}${names[4]}`);
    return parts.length ? parts.join('+') : names[5]!;
  };
  const mine = side(color === 'white');
  const theirs = side(color !== 'white');
  return t('material.vs', { mine, theirs });
}

export interface EndgameSession {
  drill: EndgameDrill;
  fen: string;
  /** Moves of both sides since the start. */
  line: SanMove[];
  /** Positions seen (EPD), for threefold repetition. */
  seen: string[];
  playerMoves: number;
  status: 'your-move' | 'success' | 'failed';
  /** The current position's evaluation (the player to move). */
  current?: PositionEval;
  /** Why the session ended. */
  message?: string;
  /** On a failure: the move that was better than the player's last one. */
  better?: SanMove;
  /** On a failure: how the engine would answer the player's last move. */
  reply?: SanMove;
  /** The player's winning chances before and after their last move. */
  winBefore?: number;
  winAfter?: number;
}

export async function startEndgame(drill: EndgameDrill, evaluator: Evaluator, depth: number): Promise<EndgameSession> {
  const current = await evaluator.evaluate(drill.fen, { depth, multiPv: 1 });
  return { drill, fen: drill.fen, line: [], seen: [epdOf(drill.fen)], playerMoves: 0, status: 'your-move', current };
}

/** A draw by the rules once `fen` is reached (stalemate, material, repetition, 50 moves), described. */
function drawText(fen: string, seen: readonly string[]): string | undefined {
  const end = terminalOf(positionFromFen(fen));
  if (end === 'stalemate') return t('endgame.stalemate');
  if (end === 'insufficient') return t('endgame.insufficient');
  if (seen.filter((e) => e === epdOf(fen)).length >= 3) return t('endgame.repetition');
  if (Number(fen.split(' ')[4]) >= 100) return t('endgame.fifty');
  return undefined;
}

/** The opponent has only their king left and `color` still has a queen or a rook: a known mate. */
export function bareKingMate(fen: string, color: Color): 'queen' | 'rook' | undefined {
  const board = fen.split(' ')[0]!;
  const white = color === 'white';
  const theirs = [...board].filter((c) => /[a-z]/i.test(c) && (white ? c === c.toLowerCase() : c === c.toUpperCase()));
  if (theirs.length !== 1) return undefined;
  if (board.includes(white ? 'Q' : 'q')) return 'queen';
  if (board.includes(white ? 'R' : 'r')) return 'rook';
  return undefined;
}

const ended = (s: EndgameSession, success: boolean, message: string, extra: Partial<EndgameSession> = {}): EndgameSession => ({
  ...s,
  ...extra,
  status: success ? 'success' : 'failed',
  message,
});

/**
 * Plays the player's move, judges it and, if the session goes on, the engine's
 * reply (its best move at `depth`).
 */
export async function playEndgameMove(s: EndgameSession, uci: string, evaluator: Evaluator, depth: number): Promise<EndgameSession> {
  if (s.status !== 'your-move') return s;
  const { drill } = s;
  const color = drill.color;
  if (!legalUci(positionFromFen(s.fen), uci)) throw new Error(`illegal move ${uci}`);
  const [mine] = replayUci(s.fen, [uci]);
  if (!mine) throw new Error(`illegal move ${uci}`);
  const winBefore = s.current && !s.current.terminal ? positionPovWinPercent(s.current, color) : undefined;
  const bestBefore = s.current?.lines[0] ? replayUci(s.fen, [s.current.lines[0].pv[0]!])[0] : undefined;
  let next: EndgameSession = {
    ...s,
    fen: mine.fenAfter,
    line: [...s.line, mine],
    seen: [...s.seen, epdOf(mine.fenAfter)],
    playerMoves: s.playerMoves + 1,
  };
  const slipped = (winAfter: number, why: string) =>
    ended(next, false, why, {
      ...(bestBefore && bestBefore.san !== mine.san ? { better: bestBefore } : {}),
      ...(winBefore !== undefined ? { winBefore } : {}),
      winAfter,
    });

  // The player's move ends the game.
  if (terminalOf(positionFromFen(mine.fenAfter)) === 'checkmate') return ended(next, true, t('endgame.checkmate'));
  const draw = drawText(mine.fenAfter, next.seen);
  if (draw) return drawn(next, draw, slipped);

  const after = await evaluator.evaluate(mine.fenAfter, { depth, multiPv: 1 });
  const winAfter = positionPovWinPercent(after, color);
  const mate = after.lines[0]?.score.mate;
  const mateForMe = mate !== undefined && (color === 'white' ? mate > 0 : mate < 0);
  const punish = after.lines[0]?.pv[0];
  const reply = punish ? replayUci(mine.fenAfter, [punish])[0] : undefined;
  const slippedHere = (why: string) => ({ ...slipped(winAfter, why), ...(reply ? { reply } : {}) });
  if (drill.goal === 'win') {
    if (mateForMe) return ended(next, true, t('endgame.convertedMate', { n: Math.abs(mate!) }), { winAfter });
    const known = bareKingMate(mine.fenAfter, color);
    if (known && winAfter >= WIN_FROM) {
      return ended(next, true, t(known === 'queen' ? 'endgame.convertedQueen' : 'endgame.convertedRook'), { winAfter });
    }
    if (winAfter < WIN_LOST_BELOW) return slippedHere(t('endgame.noLongerWinning', { san: mine.san }));
  } else {
    if (winAfter < DRAW_LOST_BELOW) return slippedHere(t('endgame.lost', { san: mine.san }));
    if (next.playerMoves >= HOLD_MOVES) return ended(next, true, t('endgame.held', { n: HOLD_MOVES }), { winAfter });
  }

  // The engine replies with its best move.
  const theirs = reply;
  if (!theirs) return ended(next, drill.goal === 'draw', t('endgame.noMove'));
  next = { ...next, fen: theirs.fenAfter, line: [...next.line, theirs], seen: [...next.seen, epdOf(theirs.fenAfter)] };
  if (terminalOf(positionFromFen(theirs.fenAfter)) === 'checkmate') return ended(next, false, t('endgame.isMate', { san: theirs.san }));
  const draw2 = drawText(theirs.fenAfter, next.seen);
  if (draw2) return drawn(next, draw2, slipped);

  const current = await evaluator.evaluate(theirs.fenAfter, { depth, multiPv: 1 });
  return { ...next, status: 'your-move', current, winAfter };
}

function drawn(s: EndgameSession, text: string, slipped: (w: number, why: string) => EndgameSession): EndgameSession {
  return s.drill.goal === 'draw' ? ended(s, true, t('endgame.heldDraw', { text })) : slipped(50, t('endgame.winGone', { text }));
}
