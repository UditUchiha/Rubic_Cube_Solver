import { describe, it, expect } from 'vitest';
import { CORNERS, EDGES, applyMove, createSolvedState, generateScramble, isSolved, CubeState } from './cubeState';
import { solveBeginner } from './beginnerSolver';

const solvedAt = (s: CubeState, cells: number[]) => cells.every((i) => s[i] === Math.floor(i / 9));

// What must hold once each named stage is done.
const CHECKS: Record<string, (s: CubeState) => boolean> = {
  'White cross': (s) => solvedAt(s, EDGES.slice(0, 4).flat()),
  'White corners': (s) => solvedAt(s, [...EDGES.slice(0, 4), ...CORNERS.slice(0, 4)].flat()),
  'Middle layer': (s) => solvedAt(s, [...EDGES.slice(0, 4), ...CORNERS.slice(0, 4), ...EDGES.slice(8)].flat()),
  'Yellow cross': (s) => EDGES.slice(4, 8).every(([d]) => s[d] === 5),
  'Yellow edges': (s) => solvedAt(s, EDGES.flat()),
  'Yellow corners: position': (s) => solvedAt(s, EDGES.flat()),
  'Yellow corners: twist': isSolved,
};

describe('solveBeginner', () => {
  it('returns no stages for a solved cube', () => {
    expect(solveBeginner(createSolvedState())).toEqual([]);
  });

  it('solves 300 random scrambles, every stage leaving its pieces solved', () => {
    let longest = 0;
    for (let i = 0; i < 300; i++) {
      const { state, moves: scramble } = generateScramble(25);
      const stages = solveBeginner(state);
      let s = state;
      for (const stage of stages) {
        s = stage.moves.reduce(applyMove, s);
        expect(CHECKS[stage.name](s), `${stage.name} after ${scramble.join(' ')}`).toBe(true);
      }
      expect(isSolved(s)).toBe(true);
      longest = Math.max(longest, stages.reduce((n, st) => n + st.moves.length, 0));
    }
    // Long but bounded: over 1000 scrambles it averaged 154 moves, max 216.
    expect(longest).toBeLessThan(260);
  }, 120_000);

  it('cancels neighbouring turns of the same face', () => {
    const { state } = generateScramble(25);
    for (const { moves } of solveBeginner(state)) {
      for (let i = 1; i < moves.length; i++) expect(moves[i][0]).not.toBe(moves[i - 1][0]);
    }
  });
});
