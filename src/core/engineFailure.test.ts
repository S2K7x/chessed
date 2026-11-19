import { describe, expect, it } from 'vitest';
import { UciEngine, type UciTransport } from './engine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A transport that never answers, and can be made to fail. */
function silentTransport() {
  let onError: (err: Error) => void = () => {};
  let terminated = false;
  const transport: UciTransport = {
    send: () => {},
    onLine: () => {},
    onError: (l) => {
      onError = l;
    },
    terminate: () => {
      terminated = true;
    },
  };
  return { transport, fail: (err: Error) => onError(err), terminated: () => terminated };
}

describe('engine startup failures', () => {
  it('rejects pending and later searches when the transport fails', async () => {
    const t = silentTransport();
    const engine = new UciEngine(t.transport, 'test');
    const pending = engine.evaluate(START, { depth: 5, multiPv: 1 });
    t.fail(new Error('engine files missing'));
    await expect(pending).rejects.toThrow('engine files missing');
    await expect(engine.evaluate(START, { depth: 5, multiPv: 1 })).rejects.toThrow('engine files missing');
    expect(engine.failed).toBe(true);
    expect(t.terminated()).toBe(true);
  });

  it('gives up when the engine does not answer at startup', async () => {
    const t = silentTransport();
    const engine = new UciEngine(t.transport, 'test', {}, { startupTimeoutMs: 20 });
    await expect(engine.evaluate(START, { depth: 5, multiPv: 1 })).rejects.toThrow(/did not start/);
    expect(engine.failed).toBe(true);
  });

  it('does not time out once the engine has answered', async () => {
    let listener: (line: string) => void = () => {};
    const transport: UciTransport = {
      send: (cmd) => {
        if (cmd === 'uci') queueMicrotask(() => listener('uciok'));
        if (cmd === 'isready') queueMicrotask(() => listener('readyok'));
        if (cmd.startsWith('go')) {
          queueMicrotask(() => {
            listener('info depth 5 multipv 1 score cp 30 pv e2e4');
            listener('bestmove e2e4');
          });
        }
      },
      onLine: (l) => {
        listener = l;
      },
      terminate: () => {},
    };
    const engine = new UciEngine(transport, 'test', {}, { startupTimeoutMs: 20 });
    const e = await engine.evaluate(START, { depth: 5, multiPv: 1 });
    expect(e.lines[0]?.pv[0]).toBe('e2e4');
    await new Promise((r) => setTimeout(r, 40));
    expect(engine.failed).toBe(false);
  });
});
