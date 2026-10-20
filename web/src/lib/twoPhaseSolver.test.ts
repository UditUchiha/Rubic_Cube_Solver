import { describe, it, expect, beforeAll } from 'vitest';
import Cube from 'cubejs';
import { applyMove, createSolvedState, generateScramble, isSolved } from './cubeState';
import { stateToFacelets } from './twoPhaseSolver';

describe('stateToFacelets', () => {
  it('maps the solved cube to cubejs face order U R F D L B', () => {
    expect(stateToFacelets(createSolvedState())).toBe(
      'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
    );
  });

  it('agrees with cubejs on every single move', () => {
    for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
      for (const move of [face, `${face}'`, `${face}2`]) {
        const expected = new Cube().move(move).asString();
        expect(stateToFacelets(applyMove(createSolvedState(), move)), move).toBe(expected);
      }
    }
  });
});

describe('two-phase solutions replayed through applyMove', () => {
  // Braces matter: vitest runs a function returned from beforeAll as teardown.
  beforeAll(() => { Cube.initSolver(); }, 30_000);

  it('solve 20 deep scrambles', () => {
    for (let i = 0; i < 20; i++) {
      const { state } = generateScramble(25);
      const solution = Cube.fromString(stateToFacelets(state)).solve(22) as string;
      const moves = solution.trim().split(/\s+/);
      expect(moves.length).toBeLessThanOrEqual(22);
      expect(isSolved(moves.reduce(applyMove, state))).toBe(true);
    }
  }, 60_000);
});
