import type { Maia3 } from 'maia3-js/web';

/**
 * Maia-3 (CSSLab, University of Toronto) predicts the moves humans of a given
 * rating actually play. Loaded on demand: the 5M-parameter model is ~22 MB.
 * Model weights: AGPL-3.0 (github.com/CSSLab/maia3); JS inference: maia3-js (MIT).
 */
let instance: Promise<Maia3> | undefined;

export function loadMaia(onProgress?: (loaded: number, total: number) => void): Promise<Maia3> {
  instance ??= (async () => {
    const { Maia3: Model } = await import('maia3-js/web');
    const base = import.meta.env.BASE_URL;
    const maia = new Model({
      variant: '5m',
      url: `${base}models/maia3_5m.onnx`,
      topK: 5,
      // One thread: the 5M model is small, and ONNX Runtime's worker threads
      // do not resolve their script correctly once bundled.
      numThreads: 1,
      ...(onProgress ? { onProgress } : {}),
    });
    await maia.load();
    return maia;
  })();
  instance.catch(() => {
    instance = undefined;
  });
  return instance;
}

export interface HumanMove {
  uci: string;
  probability: number;
}

/**
 * Most likely human moves at `elo`. `priorFens`: the positions before this one,
 * oldest first (Maia uses the last 8 as history).
 */
export async function humanMoves(fen: string, priorFens: string[], elo: number, oppoElo: number): Promise<HumanMove[]> {
  const maia = await loadMaia();
  const r = await maia.predict({ fen, priorFens: priorFens.slice(-8), selfElo: elo, oppoElo });
  return [...r.moves.entries()]
    .map(([uci, probability]) => ({ uci, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

/** Maia's move for the side to move (most likely human move at `elo`). */
export async function maiaMove(fen: string, priorFens: string[], elo: number, oppoElo: number): Promise<string> {
  const maia = await loadMaia();
  const r = await maia.predict({ fen, priorFens: priorFens.slice(-8), selfElo: elo, oppoElo });
  return r.bestMove;
}

/** Ratings Maia-3 supports (Lichess blitz scale). */
export const clampMaiaElo = (elo: number) => Math.max(600, Math.min(2600, Math.round(elo)));
