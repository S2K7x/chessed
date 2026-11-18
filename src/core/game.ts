import type { Color } from './eval';

export type Platform = 'lichess' | 'chesscom' | 'pgn';

export type SpeedClass = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface Player {
  name: string;
  elo?: number;
}

export interface TimeControl {
  /** Raw PGN value, e.g. "180+2" or "1/86400". */
  raw: string;
  initialSeconds?: number;
  incrementSeconds?: number;
  speed?: SpeedClass;
}

export interface GameMove {
  /** 1 = White's first move. */
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Clock of the mover after the move, when the PGN has `[%clk]`. */
  clockMs?: number;
}

export interface Game {
  /** Stable id: source game id when known, else a hash of the moves. */
  id: string;
  source: Platform;
  sourceUrl?: string;
  sourceGameId?: string;
  white: Player;
  black: Player;
  /** "1-0", "0-1", "1/2-1/2" or "*". */
  result: string;
  termination?: string;
  /** ISO date (YYYY-MM-DD) when known. */
  date?: string;
  timeControl?: TimeControl;
  eco?: string;
  openingName?: string;
  startFen: string;
  moves: GameMove[];
  pgn: string;
  importedAt: number;
}

/** Lichess' speed estimate: initial + 40 × increment seconds. */
export function speedOf(initial: number, increment: number): SpeedClass {
  const total = initial + 40 * increment;
  if (total < 30) return 'ultrabullet';
  if (total < 180) return 'bullet';
  if (total < 480) return 'blitz';
  if (total < 1500) return 'rapid';
  return 'classical';
}

export function parseTimeControl(raw: string | undefined): TimeControl | undefined {
  if (!raw || raw === '-' || raw === '?') return undefined;
  const daily = /^1\/(\d+)$/.exec(raw);
  if (daily) return { raw, speed: 'correspondence' };
  const m = /^(\d+)(?:\+(\d+))?$/.exec(raw);
  if (!m) return { raw };
  const initialSeconds = Number(m[1]);
  const incrementSeconds = Number(m[2] ?? 0);
  return { raw, initialSeconds, incrementSeconds, speed: speedOf(initialSeconds, incrementSeconds) };
}

/** Small deterministic string hash (FNV-1a, 32 bits) rendered in base 36. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
