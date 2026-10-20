/*
 * 2x2 optimal solver, off the main thread: the distance table build is a
 * tight loop over 3.7 million states that would otherwise freeze the page.
 */

import type { CubeState } from './cubeState';
import { buildTables, solve } from './pocketCube';
import type { WorkerRequest, WorkerResponse } from './browserSolver';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      const started = performance.now();
      buildTables();
      const payload: WorkerResponse = {
        type: 'ready',
        initMs: performance.now() - started,
        scripts: [self.location.href, ...performance.getEntriesByType('resource').map((e) => e.name)],
      };
      self.postMessage(payload);
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
      const started = performance.now();
      const moves = solve(message.input as CubeState);
      const payload: WorkerResponse = {
        type: 'solved', id: message.id, moves, solveMs: performance.now() - started,
      };
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
