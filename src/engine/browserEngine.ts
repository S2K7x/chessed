import { UciEngine, type UciTransport } from '../core/engine';

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;
export const ENGINE_ID = 'sf19-lite';

/** Stockfish 19 lite (single-threaded WASM) in a dedicated Web Worker. */
export function createBrowserEngine(): UciEngine {
  const worker = new Worker(ENGINE_URL);
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
  return new UciEngine(transport, ENGINE_ID, { Hash: 32 });
}
