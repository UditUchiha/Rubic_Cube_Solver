import type { CubeState } from './cubeState';
import { applyMove, isSolved } from './cubeState';
import { BrowserSolver } from './browserSolver';

export type { SolverStatus } from './browserSolver';

/*
 * Browser-side two-phase (Kociemba) solver.
 *
 * Solutions are ~21 moves rather than the provably optimal 12-18 the C++ IDA*
 * backend finds, but they arrive in about 100ms regardless of scramble depth,
 * where IDA* costs 5-8x more per extra move and ran 21s for a 12-move scramble
 * on the deployed free-tier backend.
 */

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

export const twoPhaseSolver = new BrowserSolver({
  createWorker: () => new Worker(new URL('./twoPhase.worker.ts', import.meta.url)),
  encode: stateToFacelets,
  applyMove,
  isSolved,
});
