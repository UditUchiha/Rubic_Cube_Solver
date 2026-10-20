import type { CubeState } from './cubeState';

/*
 * Main-thread handle on a solver that runs in a Web Worker. Shared by every
 * in-browser solver; each one supplies its own worker and input encoding.
 *
 * Every worker speaks the protocol below: one `init` to build its tables, then
 * `solve` requests carrying whatever input that worker understands.
 */

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'solve'; id: number; input: unknown };

export type WorkerResponse =
  | { type: 'ready'; initMs: number }
  | { type: 'init-error'; error: string }
  | { type: 'solved'; id: number; moves: string[]; solveMs: number }
  | { type: 'solve-error'; id: number; error: string };

export interface SolveResult {
  moves: string[];
  solveMs: number;
}

export type SolverStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

type Pending = {
  resolve: (value: SolveResult) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface BrowserSolverOptions {
  createWorker: () => Worker;
  encode: (state: CubeState) => unknown;
  applyMove: (state: CubeState, move: string) => CubeState;
  isSolved: (state: CubeState) => boolean;
}

export class BrowserSolver {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private status: SolverStatus = 'idle';
  private listeners = new Set<(status: SolverStatus) => void>();
  private initMs = 0;

  constructor(private options: BrowserSolverOptions) {}

  getStatus(): SolverStatus {
    return this.status;
  }

  getInitMs(): number {
    return this.initMs;
  }

  onStatusChange(listener: (status: SolverStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private setStatus(status: SolverStatus) {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }

  /*
   * Start building the solver's tables. Safe to call repeatedly; call it as
   * early as possible so the table build overlaps with the user entering their
   * cube rather than with them waiting for an answer.
   */
  warmUp(): void {
    if (this.worker || this.status === 'unavailable') return;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.setStatus('unavailable');
      return;
    }

    try {
      this.worker = this.options.createWorker();
    } catch {
      this.setStatus('unavailable');
      return;
    }

    this.setStatus('loading');

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      switch (message.type) {
        case 'ready':
          this.initMs = message.initMs;
          this.setStatus('ready');
          break;

        case 'init-error':
          this.setStatus('unavailable');
          this.failAll(new Error(message.error));
          break;

        case 'solved': {
          const entry = this.pending.get(message.id);
          if (!entry) break;
          clearTimeout(entry.timer);
          this.pending.delete(message.id);
          entry.resolve({ moves: message.moves, solveMs: message.solveMs });
          break;
        }

        case 'solve-error': {
          const entry = this.pending.get(message.id);
          if (!entry) break;
          clearTimeout(entry.timer);
          this.pending.delete(message.id);
          entry.reject(new Error(message.error));
          break;
        }
      }
    };

    // A worker that dies takes its tables with it, so drop it and let the next
    // call build a fresh one rather than hanging forever on a dead handle.
    this.worker.onerror = () => {
      this.failAll(new Error('Solver worker crashed'));
      this.worker?.terminate();
      this.worker = null;
      this.setStatus('idle');
    };

    const request: WorkerRequest = { type: 'init' };
    this.worker.postMessage(request);
  }

  private failAll(error: Error) {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    this.pending.clear();
  }

  /*
   * Solve a state. Rejects rather than returning a wrong answer: the move list
   * is replayed through this project's own engine before being handed back, so
   * a bad solution surfaces here instead of on the user's actual cube.
   */
  solve(state: CubeState, timeoutMs = 20000): Promise<SolveResult> {
    const { encode, applyMove, isSolved } = this.options;

    // Handed a solved cube, a search can return a sequence that ends where it
    // started (two-phase does: 14 moves). Answer the obvious way instead.
    if (isSolved(state)) return Promise.resolve({ moves: [], solveMs: 0 });

    const input = encode(state);

    this.warmUp();
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Solver is unavailable in this browser'));

    const id = this.nextId++;

    return new Promise<SolveResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Solver timed out'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      const request: WorkerRequest = { type: 'solve', id, input };
      worker.postMessage(request);
    }).then((result) => {
      let replayed = state;
      for (const move of result.moves) replayed = applyMove(replayed, move);
      if (!isSolved(replayed)) {
        throw new Error('Solver returned a move list that does not solve this cube');
      }
      return result;
    });
  }
}
