import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { UciEngine, type UciTransport } from '../core/engine';

/**
 * A UCI engine in a child process: a native Stockfish binary when `binary` is
 * given (fastest), otherwise the WASM build of the `stockfish` package run by
 * Node. Both speak UCI over stdin/stdout.
 */
export function createProcessEngine(opts: { binary?: string; threads?: number; hash?: number } = {}): UciEngine {
  let command: string;
  let args: string[];
  let id: string;
  if (opts.binary) {
    command = opts.binary;
    args = [];
    id = 'stockfish-native';
  } else {
    const require = createRequire(import.meta.url);
    const findEngine = (require('stockfish') as { findEngine: (flavor: string) => string }).findEngine;
    command = process.execPath;
    args = [findEngine('lite-single')];
    id = 'sf19-lite';
  }
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let listener: (line: string) => void = () => {};
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) listener(line);
    }
  });
  const transport: UciTransport = {
    send: (cmd) => child.stdin.write(`${cmd}\n`),
    onLine: (l) => {
      listener = l;
    },
    terminate: () => child.kill(),
  };
  const options: Record<string, number> = { Hash: opts.hash ?? 64 };
  if (opts.binary && opts.threads) options.Threads = opts.threads;
  return new UciEngine(transport, id, options);
}
