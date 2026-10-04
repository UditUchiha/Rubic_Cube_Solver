/*
 * Kociemba two-phase solver, running off the main thread.
 *
 * Two things make a worker the right home for this:
 *
 *  - initSolver() builds the pruning tables in about 1.5-3s and blocks
 *    whatever thread it runs on. On the main thread that is a frozen page; in
 *    a worker it happens quietly while the user is still painting their cube.
 *  - It only has to happen once per page load. The previous attempt ran this
 *    inside a Vercel serverless route, so every cold start paid the full table
 *    build again before it could even start solving.
 *
 * The solver itself is correct - 200/200 deep scrambles verified against this
 * project's own move engine - so none of this is about fixing the algorithm.
 */

import Cube from 'cubejs';

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'solve'; id: number; facelets: string; maxDepth?: number };

export type WorkerResponse =
  | { type: 'ready'; initMs: number }
  | { type: 'init-error'; error: string }
  | { type: 'solved'; id: number; moves: string[]; solveMs: number }
  | { type: 'solve-error'; id: number; error: string };

let ready = false;

function ensureReady(): void {
  if (ready) return;
  const started = performance.now();
  Cube.initSolver();
  ready = true;
  const payload: WorkerResponse = { type: 'ready', initMs: performance.now() - started };
  self.postMessage(payload);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      ensureReady();
    } catch (err) {
      const payload: WorkerResponse = {
        type: 'init-error',
        error: err instanceof Error ? err.message : 'Failed to build solver tables',
      };
      self.postMessage(payload);
    }
    return;
  }

  if (message.type === 'solve') {
    try {
      // A solve that arrives before init finishes just builds the tables first
      // rather than failing.
      ensureReady();

      const started = performance.now();
      const solution = Cube.fromString(message.facelets).solve(message.maxDepth ?? 22);
      const solveMs = performance.now() - started;

      if (solution === null || solution === undefined) {
        const payload: WorkerResponse = {
          type: 'solve-error',
          id: message.id,
          error: `No solution found within ${message.maxDepth ?? 22} moves`,
        };
        self.postMessage(payload);
        return;
      }

      const moves = solution.trim() ? solution.trim().split(/\s+/) : [];
      const payload: WorkerResponse = { type: 'solved', id: message.id, moves, solveMs };
      self.postMessage(payload);
    } catch (err) {
      const payload: WorkerResponse = {
        type: 'solve-error',
        id: message.id,
        error: err instanceof Error ? err.message : 'Solver failed',
      };
      self.postMessage(payload);
    }
  }
};
