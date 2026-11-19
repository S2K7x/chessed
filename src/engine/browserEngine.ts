import { t } from '../i18n';
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
  const url = `${import.meta.env.BASE_URL}engine/${file}`;
  const worker = new Worker(url);
  let listener: (line: string) => void = () => {};
  let onError: (err: Error) => void = () => {};
  worker.onmessage = (e: MessageEvent<unknown>) => {
    if (typeof e.data === 'string') listener(e.data);
  };
  worker.onerror = (e) => {
    e.preventDefault();
    void diagnose(url, e.message).then((err) => onError(err));
  };
  const transport: UciTransport = {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (l) => {
      listener = l;
    },
    onError: (l) => {
      onError = l;
    },
    terminate: () => worker.terminate(),
  };
  return new UciEngine(transport, ENGINE_ID, threads > 1 ? { Threads: threads, Hash: 64 } : { Hash: 32 }, {
    // Compiling the WASM takes a second or two; a minute means it is stuck.
    startupTimeoutMs: 60_000,
  });
}

export const engineMissing = () => t('engine.missing');

/** Why the engine worker failed: its file is missing (served as a page, or 404), or it broke while starting. */
async function diagnose(url: string, message: string): Promise<Error> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('text/html')) return new Error(engineMissing());
  } catch {
    // Offline and not cached: the same remedy applies once back online.
    return new Error(t('engine.unreachable'));
  }
  return new Error(t('engine.broken', { detail: message ? ` (${message})` : '' }));
}
