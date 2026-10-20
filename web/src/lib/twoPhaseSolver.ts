import type { CubeState } from './cubeState';
import { applyMove, isSolved } from './cubeState';
import { cacheForOffline } from './offline';
import type { WorkerRequest, WorkerResponse } from './twoPhase.worker';

/*
 * Browser-side two-phase (Kociemba) solver.
 *
 * Solutions are ~21 moves rather than the provably optimal 12-18 the C++ IDA*
 * backend finds, but they arrive in about 100ms regardless of scramble depth,
 * where IDA* costs 5-8x more per extra move and ran 21s for a 12-move scramble
 * on the deployed free-tier backend.
 */

export interface TwoPhaseResult {
  moves: string[];
  solveMs: number;
}

/*
 * Convert this project's 54-cell state to the facelet string cubejs expects.
 *
 * Two differences to bridge:
 *  - face order: ours is U L F R B D, cubejs wants U R F D L B
 *  - cell values: ours are colour indices, cubejs wants face letters
 *
 * Mapping each colour through the centre that carries it handles the second,
 * and incidentally makes this independent of the colour scheme: this project
 * uses F=red/L=green where the usual Western scheme is F=green/L=orange, and
 * going via centres means neither side has to care.
 */
export function stateToFacelets(state: CubeState): string {
  if (state.length !== 54) throw new Error('State must be exactly 54 cells');

  const face = (i: number) => state.slice(i * 9, i * 9 + 9);
  const [U, L, F, R, B, D] = [face(0), face(1), face(2), face(3), face(4), face(5)];

  const letterForColour = new Map<number, string>([
    [U[4], 'U'], [L[4], 'L'], [F[4], 'F'],
    [R[4], 'R'], [B[4], 'B'], [D[4], 'D'],
  ]);
  if (letterForColour.size !== 6) {
    throw new Error('Centre stickers must all be different colours');
  }

  const letters = (f: number[]) =>
    f.map((c) => {
      const letter = letterForColour.get(c);
      if (!letter) throw new Error('Sticker colour does not match any centre');
      return letter;
    });

  return [...letters(U), ...letters(R), ...letters(F),
          ...letters(D), ...letters(L), ...letters(B)].join('');
}

type Pending = {
  resolve: (value: TwoPhaseResult) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type SolverStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

class TwoPhaseSolver {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private status: SolverStatus = 'idle';
  private listeners = new Set<(status: SolverStatus) => void>();
  private initMs = 0;

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
   * Start building the pruning tables. Safe to call repeatedly; call it as
   * early as possible so the ~2s table build overlaps with the user entering
   * their cube rather than with them waiting for an answer.
   */
  warmUp(): void {
    if (this.worker || this.status === 'unavailable') return;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.setStatus('unavailable');
      return;
    }

    try {
      this.worker = new Worker(new URL('./twoPhase.worker.ts', import.meta.url));
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
          cacheForOffline(message.scripts);
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
  solve(state: CubeState, timeoutMs = 20000): Promise<TwoPhaseResult> {
    // Handed a solved cube, the two-phase search happily returns a 14-move
    // sequence that ends where it started. Answer the obvious way instead.
    if (isSolved(state)) return Promise.resolve({ moves: [], solveMs: 0 });

    const facelets = stateToFacelets(state);

    this.warmUp();
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Solver is unavailable in this browser'));

    const id = this.nextId++;

    return new Promise<TwoPhaseResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Solver timed out'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      const request: WorkerRequest = { type: 'solve', id, facelets };
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

export const twoPhaseSolver = new TwoPhaseSolver();
