import { createRequire } from 'node:module';
import { UciEngine, type UciTransport } from '../engine';

/** Stockfish (same WASM build as the browser) for Node tests. */
export function createNodeEngine(): UciEngine {
  const require = createRequire(import.meta.url);
  const init = require('stockfish') as (flavor: string, onLine: (line: string) => void) => {
    processCommand(cmd: string): void;
    terminate(): void;
  };
  let listener: (line: string) => void = () => {};
  const sf = init('lite-single', (line) => listener(line));
  const transport: UciTransport = {
    send: (cmd) => sf.processCommand(cmd),
    onLine: (l) => {
      listener = l;
    },
    terminate: () => sf.terminate(),
  };
  return new UciEngine(transport, 'sf19-lite', { Hash: 32 });
}
