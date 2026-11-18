import type { UciScore } from './eval';

export interface UciInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  score: UciScore;
  bound?: 'lower' | 'upper';
  nodes?: number;
  pv: string[];
}

/**
 * Parses an `info` line that carries a score and a principal variation.
 * Returns undefined for other info lines (currmove, hashfull only, strings...).
 */
export function parseInfo(line: string): UciInfo | undefined {
  if (!line.startsWith('info ')) return undefined;
  const t = line.split(/\s+/);
  let depth: number | undefined;
  let seldepth: number | undefined;
  let multipv = 1;
  let score: UciScore | undefined;
  let bound: 'lower' | 'upper' | undefined;
  let nodes: number | undefined;
  let pv: string[] | undefined;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i]);
        break;
      case 'seldepth':
        seldepth = Number(t[++i]);
        break;
      case 'multipv':
        multipv = Number(t[++i]);
        break;
      case 'nodes':
        nodes = Number(t[++i]);
        break;
      case 'score': {
        const kind = t[++i];
        const value = Number(t[++i]);
        if (kind === 'cp') score = { cp: value };
        else if (kind === 'mate') score = { mate: value };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = t[++i] === 'lowerbound' ? 'lower' : 'upper';
        }
        break;
      }
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
      case 'string':
        return undefined;
    }
  }
  if (depth === undefined || score === undefined || !pv || pv.length === 0) return undefined;
  const info: UciInfo = { depth, multipv, score, pv };
  if (seldepth !== undefined) info.seldepth = seldepth;
  if (bound) info.bound = bound;
  if (nodes !== undefined) info.nodes = nodes;
  return info;
}

/** Returns the best move of a `bestmove` line, `null` for "(none)", undefined otherwise. */
export function parseBestMove(line: string): string | null | undefined {
  const m = /^bestmove\s+(\S+)/.exec(line);
  if (!m) return undefined;
  return m[1] === '(none)' ? null : (m[1] ?? null);
}
