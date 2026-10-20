import { describe, it, expect } from 'vitest';
import { applyMove, createSolvedState, generateScramble, isSolved, Color } from './cubeState';
import { solve2x2 } from './cube2x2';

const FACES = ['U', 'L', 'F', 'R', 'B', 'D'];
const ALL_MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);

describe('2x2 moves', () => {
  it.each(ALL_MOVES)('%s repeated to its order returns to the start', (move) => {
    const { state } = generateScramble(12, 2);
    const order = move.endsWith('2') ? 2 : 4;
    expect(Array(order).fill(move).reduce(applyMove, state)).toEqual(state);
  });

  it('R U R\' U\' has order 6, as on a 3x3', () => {
    let state = createSolvedState(2);
    for (let i = 1; i <= 6; i++) {
      state = ['R', 'U', "R'", "U'"].reduce(applyMove, state);
      expect(isSolved(state)).toBe(i === 6);
    }
  });
});

describe('solve2x2', () => {
  it('returns no moves for a solved cube in any orientation', () => {
    expect(solve2x2(createSolvedState(2))).toEqual({ moves: [] });
    // U D' on a 2x2 is a whole-cube rotation: still solved.
    const rotated = ['U', "D'"].reduce(applyMove, createSolvedState(2));
    expect(isSolved(rotated)).toBe(true);
    expect(solve2x2(rotated)).toEqual({ moves: [] });
  });

  it('undoes a single move in one move', () => {
    expect(solve2x2(applyMove(createSolvedState(2), 'R'))).toEqual({ moves: ["R'"] });
  });

  it('solves random scrambles optimally-bounded and correctly', () => {
    for (let i = 0; i < 40; i++) {
      const { state, moves: scramble } = generateScramble(1 + (i % 20), 2);
      const result = solve2x2(state);
      expect(result, scramble.join(' ')).toHaveProperty('moves');
      const { moves } = result as { moves: string[] };
      expect(isSolved(moves.reduce(applyMove, state)), scramble.join(' ')).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(Math.min(11, scramble.length));
      expect(moves.every((m) => 'URF'.includes(m[0]))).toBe(true);
    }
  });

  it('rejects a twisted corner', () => {
    const s = [...createSolvedState(2)] as Color[];
    // UFR corner: U bottom-right (3), F top-right (9), R top-left (12).
    [s[3], s[9], s[12]] = [s[9], s[12], s[3]];
    expect(solve2x2(s)).toHaveProperty('error');
  });

  it('rejects wrong colour counts', () => {
    const s = [...createSolvedState(2)] as Color[];
    s[0] = 5;
    expect(solve2x2(s)).toEqual({ error: 'Each colour must appear exactly 4 times on a 2x2.' });
  });
});
