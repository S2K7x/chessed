import { fromUciScore, whiteCp, whiteMate, type Color, type EngineLine, type PositionEval, type UciScore, type WhiteScore } from './eval';
import { legalUci, positionFromFen } from './chess';
import type { Fetch } from './import/fetchers';

/**
 * Exact or precomputed evaluations from Lichess:
 * - tablebases (tablebase.lichess.ovh): exact results with seven pieces or fewer;
 * - cloud evaluations (lichess.org/api/cloud-eval): deep evaluations of
 *   positions that were already analysed, mostly openings. Lichess asks to use
 *   this endpoint for "a few positions here and there", so callers limit it to
 *   the first plies of a game.
 * Any failure returns undefined and the local engine is used instead.
 */
export interface RemoteEvaluator {
  get(fen: string, ply: number, opts: { depth: number; multiPv: number }): Promise<PositionEval | undefined>;
}

export const TABLEBASE_MAX_PIECES = 7;
/** Plies (from the start of the game) for which cloud evaluations are requested. */
export const CLOUD_MAX_PLY = 20;

type TbCategory = 'win' | 'loss' | 'draw' | 'cursed-win' | 'blessed-loss' | 'maybe-win' | 'maybe-loss' | 'unknown';

interface TbMove {
  uci: string;
  category: TbCategory;
  dtm?: number | null;
}

interface TbResponse {
  category: TbCategory;
  dtm?: number | null;
  moves: TbMove[];
}

const EXACT_DEPTH = 99;

/** Score for the side to move, from a tablebase category. `plies`: |DTM| when known. */
function tbScore(category: TbCategory, plies: number | undefined): UciScore | undefined {
  switch (category) {
    case 'win':
      return plies ? { mate: Math.ceil(plies / 2) } : { cp: 2000 };
    case 'loss':
      return plies ? { mate: -Math.max(1, Math.ceil(plies / 2)) } : { cp: -2000 };
    case 'draw':
    case 'cursed-win':
    case 'blessed-loss':
      return { cp: 0 };
    default:
      return undefined;
  }
}

const invert = (c: TbCategory): TbCategory =>
  ({ win: 'loss', loss: 'win', 'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win', 'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win', draw: 'draw', unknown: 'unknown' })[c] as TbCategory;

export function tablebaseToEval(fen: string, data: TbResponse, multiPv: number): PositionEval | undefined {
  const pos = positionFromFen(fen);
  const turn: Color = pos.turn;
  const lines: EngineLine[] = [];
  for (const m of data.moves) {
    if (lines.length >= Math.max(1, multiPv)) break;
    if (!legalUci(pos, m.uci)) return undefined;
    // A move's category and DTM are from the opponent's point of view after it.
    const mover = invert(m.category);
    const plies = m.dtm != null ? Math.abs(m.dtm) + 1 : undefined;
    const s = tbScore(mover, plies);
    if (!s) return undefined;
    if ('mate' in s && s.mate === 0) return undefined;
    lines.push({ rank: lines.length + 1, score: fromUciScore(s, turn), pv: [m.uci], depth: EXACT_DEPTH });
  }
  if (lines.length === 0) return undefined;
  return { fen, turn, lines, depth: EXACT_DEPTH, source: 'tablebase', engineId: 'syzygy' };
}

interface CloudPv {
  moves: string;
  cp?: number;
  mate?: number;
}

/** Cloud evaluations are reported from White's point of view. */
export function cloudToEval(fen: string, data: { depth: number; pvs: CloudPv[] }): PositionEval | undefined {
  const pos = positionFromFen(fen);
  const lines: EngineLine[] = [];
  for (const pv of data.pvs) {
    const moves = pv.moves.split(' ').filter(Boolean);
    if (!moves[0] || !legalUci(pos, moves[0])) return undefined;
    let score: WhiteScore;
    if (pv.mate !== undefined && pv.mate !== 0) score = whiteMate(pv.mate);
    else if (pv.cp !== undefined) score = whiteCp(pv.cp);
    else return undefined;
    lines.push({ rank: lines.length + 1, score, pv: moves, depth: data.depth });
  }
  if (lines.length === 0) return undefined;
  return { fen, turn: pos.turn, lines, depth: data.depth, source: 'cloud', engineId: 'lichess-cloud' };
}

const pieceCount = (fen: string) => (fen.split(' ')[0]!.match(/[a-zA-Z]/g) ?? []).length;

export function lichessRemote(fetch: Fetch): RemoteEvaluator {
  let cloudDisabled = false;
  let tablebaseDisabled = false;
  return {
    async get(fen, ply, opts) {
      try {
        const castling = fen.split(' ')[2];
        if (!tablebaseDisabled && pieceCount(fen) <= TABLEBASE_MAX_PIECES && castling === '-') {
          const res = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`);
          if (res.status === 429) tablebaseDisabled = true;
          if (res.ok) return tablebaseToEval(fen, (await res.json()) as TbResponse, opts.multiPv);
          return undefined;
        }
        if (!cloudDisabled && ply <= CLOUD_MAX_PLY) {
          const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${opts.multiPv}`);
          if (res.status === 429) cloudDisabled = true;
          if (!res.ok) return undefined;
          const data = (await res.json()) as { depth: number; pvs: CloudPv[] };
          const pos = positionFromFen(fen);
          let legal = 0;
          for (const [, d] of pos.allDests()) legal += d.size();
          // Only use it when it is at least as deep, with as many lines as we need.
          if (data.depth < opts.depth || data.pvs.length < Math.min(opts.multiPv, legal)) return undefined;
          return cloudToEval(fen, data);
        }
      } catch {
        // Network errors: fall back to the local engine.
      }
      return undefined;
    },
  };
}
