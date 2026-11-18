import { UciEngine, type UciTransport } from '../core/engine';

export const ENGINE_ID = 'sf19-lite';

/** Threads for the multi-threaded build: leave one core for the page. */
export function engineThreads(): number {
  if (!globalThis.crossOriginIsolated) return 1;
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(8, cores - 1));
}

/**
 * Stockfish 19 lite (WASM) in a dedicated Web Worker. Uses the multi-threaded
 * build when the page is cross-origin isolated, the single-threaded one otherwise.
 */
export function createBrowserEngine(): UciEngine {
  const threads = engineThreads();
  const file = threads > 1 ? 'stockfish-19-lite.js' : 'stockfish-19-lite-single.js';
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/${file}`);
  let listener: (line: string) => void = () => {};
  worker.onmessage = (e: MessageEvent<unknown>) => {
    if (typeof e.data === 'string') listener(e.data);
  };
  const transport: UciTransport = {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (l) => {
      listener = l;
    },
    terminate: () => worker.terminate(),
  };
  return new UciEngine(transport, ENGINE_ID, threads > 1 ? { Threads: threads, Hash: 64 } : { Hash: 32 });
}
