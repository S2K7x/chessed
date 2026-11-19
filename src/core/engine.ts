import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { fromUciScore, type Color, type EngineLine, type PositionEval } from './eval';
import { parseBestMove, parseInfo, type UciInfo } from './uci';

/** Minimal duplex channel to a UCI engine (Web Worker, Node module, ...). */
export interface UciTransport {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  /** Reports a transport that broke (worker failed to load, process exited...). */
  onError?(listener: (err: Error) => void): void;
  terminate(): void;
}

export interface EngineStartOptions {
  /** Give up when the engine has not answered `uci` within this time. */
  startupTimeoutMs?: number;
}

export interface SearchOptions {
  depth: number;
  multiPv: number;
  /** Restrict the search to these UCI moves (UCI `searchmoves`). */
  searchMoves?: readonly string[];
}

export interface Evaluator {
  readonly id: string;
  evaluate(fen: string, opts: SearchOptions, onProgress?: (e: PositionEval) => void): Promise<PositionEval>;
}

interface Job {
  fen: string;
  turn: Color;
  opts: SearchOptions;
  onProgress: ((e: PositionEval) => void) | undefined;
  resolve: (e: PositionEval) => void;
  reject: (err: Error) => void;
}

/**
 * Drives one UCI engine: serialises searches, collects MultiPV lines and
 * converts every score to White's point of view as soon as it is parsed.
 */
export class UciEngine implements Evaluator {
  readonly id: string;
  private readonly transport: UciTransport;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | undefined;
  private lines = new Map<number, UciInfo>();
  private waiters: { token: string; resolve: () => void; reject: (err: Error) => void }[] = [];
  private multiPv = 1;
  private disposed = false;
  private failure: Error | undefined;

  constructor(transport: UciTransport, id: string, options: Record<string, string | number> = {}, start: EngineStartOptions = {}) {
    this.transport = transport;
    this.id = id;
    transport.onLine((line) => this.handle(line));
    transport.onError?.((err) => this.fail(err));
    const timer =
      start.startupTimeoutMs !== undefined
        ? setTimeout(() => this.fail(new Error('The chess engine did not start in time.')), start.startupTimeoutMs)
        : undefined;
    this.ready = (async () => {
      await this.command('uci', 'uciok');
      if (timer !== undefined) clearTimeout(timer);
      for (const [name, value] of Object.entries(options)) {
        transport.send(`setoption name ${name} value ${value}`);
      }
      await this.command('isready', 'readyok');
    })();
    // Failures reach the searches waiting on `ready`; none may be waiting yet.
    this.ready.catch(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  /** The engine broke (could not load, or stopped answering at startup): create a new one. */
  get failed(): boolean {
    return this.failure !== undefined;
  }

  evaluate(fen: string, opts: SearchOptions, onProgress?: (e: PositionEval) => void): Promise<PositionEval> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.disposed) return Promise.reject(new Error('engine disposed'));
    // Stockfish aborts on illegal positions: validate before sending.
    const setup = parseFen(fen);
    if (setup.isErr || Chess.fromSetup(setup.value).isErr) {
      return Promise.reject(new Error(`invalid position: ${fen}`));
    }
    const turn: Color = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, turn, opts, onProgress, resolve, reject });
      void this.pump();
    });
  }

  /** Stops the current search and drops queued ones. */
  cancelAll(): void {
    for (const job of this.queue) job.reject(new Error('cancelled'));
    this.queue = [];
    if (this.current) this.transport.send('stop');
  }

  dispose(): void {
    this.cancelAll();
    this.disposed = true;
    this.transport.terminate();
  }

  private command(cmd: string, token: string): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiters.push({ token, resolve, reject });
      this.transport.send(cmd);
    });
  }

  /** Rejects every pending command and search with `err`; later calls fail at once. */
  private fail(err: Error): void {
    if (this.failure || this.disposed) return;
    this.failure = err;
    for (const w of this.waiters.splice(0)) w.reject(err);
    const jobs = [...(this.current ? [this.current] : []), ...this.queue.splice(0)];
    this.current = undefined;
    for (const job of jobs) job.reject(err);
    this.transport.terminate();
  }

  private async pump(): Promise<void> {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    try {
      await this.ready;
      const multiPv = Math.max(1, job.opts.multiPv);
      if (multiPv !== this.multiPv) {
        this.transport.send(`setoption name MultiPV value ${multiPv}`);
        this.multiPv = multiPv;
        await this.command('isready', 'readyok');
      }
      this.lines.clear();
      this.transport.send(`position fen ${job.fen}`);
      const restrict = job.opts.searchMoves?.length ? ` searchmoves ${job.opts.searchMoves.join(' ')}` : '';
      this.transport.send(`go depth ${job.opts.depth}${restrict}`);
    } catch (err) {
      this.current = undefined;
      job.reject(err instanceof Error ? err : new Error(String(err)));
      void this.pump();
    }
  }

  private handle(line: string): void {
    const waiter = this.waiters[0];
    if (waiter && line.trim() === waiter.token) {
      this.waiters.shift();
      waiter.resolve();
      return;
    }
    const job = this.current;
    if (!job) return;
    const info = parseInfo(line);
    if (info) {
      // A mate-in-0 score only appears for positions that are already over;
      // those are filtered out before reaching the engine.
      if ('mate' in info.score && info.score.mate === 0) return;
      this.lines.set(info.multipv, info);
      if (job.onProgress && info.multipv === this.multiPv) job.onProgress(this.snapshot(job));
      return;
    }
    const best = parseBestMove(line);
    if (best === undefined) return;
    this.current = undefined;
    const result = this.snapshot(job);
    if (result.lines.length === 0 && best !== null) {
      // Searches stopped before any info line: keep the move, no score.
      job.reject(new Error(`no evaluation for ${job.fen}`));
    } else {
      job.resolve(result);
    }
    void this.pump();
  }

  private snapshot(job: Job): PositionEval {
    const infos = [...this.lines.values()].sort((a, b) => a.multipv - b.multipv);
    const topDepth = infos[0]?.depth ?? 0;
    const lines: EngineLine[] = infos
      // Lines from an older iteration than the top line are not comparable.
      .filter((i) => i.depth >= topDepth - 1)
      .map((i) => {
        const l: EngineLine = {
          rank: i.multipv,
          score: fromUciScore(i.score, job.turn),
          pv: i.pv,
          depth: i.depth,
          ...(i.bound ? { bound: i.bound } : {}),
        };
        return l;
      });
    return { fen: job.fen, turn: job.turn, lines, depth: topDepth, source: 'engine', engineId: this.id };
  }
}
