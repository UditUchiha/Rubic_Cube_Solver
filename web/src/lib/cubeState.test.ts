import { describe, it, expect } from 'vitest';
import {
  CubeState, Color, applyMove, createSolvedState, deserialize, generateScramble,
  isSolved, parseAlgorithm, serialize, validate,
} from './cubeState';

const FACES = ['U', 'L', 'F', 'R', 'B', 'D'];
const ALL_MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);

const apply = (state: CubeState, moves: string[]) => moves.reduce(applyMove, state);
const inverse = (move: string) =>
  move.endsWith("'") ? move[0] : move.endsWith('2') ? move : `${move}'`;
const invert = (moves: string[]) => [...moves].reverse().map(inverse);

describe('applyMove', () => {
  it.each(ALL_MOVES)('%s repeated to its order returns to the start', (move) => {
    const { state } = generateScramble(15);
    const order = move.endsWith('2') ? 2 : 4;
    expect(apply(state, Array(order).fill(move))).toEqual(state);
  });

  it.each(ALL_MOVES)('%s followed by its inverse is the identity', (move) => {
    const { state } = generateScramble(15);
    expect(apply(state, [move, inverse(move)])).toEqual(state);
  });

  it('a quarter turn changes the cube', () => {
    for (const move of ALL_MOVES) expect(isSolved(applyMove(createSolvedState(), move))).toBe(false);
  });

  it('the sexy move has order 6', () => {
    const solved = createSolvedState();
    const sexy = ['R', 'U', "R'", "U'"];
    let state = solved;
    for (let i = 1; i <= 6; i++) {
      state = apply(state, sexy);
      expect(isSolved(state)).toBe(i === 6);
    }
  });
});

describe('validate', () => {
  it('accepts the solved cube and random scrambles', () => {
    expect(validate(createSolvedState()).valid).toBe(true);
    for (let i = 0; i < 200; i++) {
      const { state } = generateScramble(1 + (i % 25));
      expect(validate(state).valid).toBe(true);
    }
  });

  // Facelet indices are face * 9 + row * 3 + col, faces U L F R B D.
  const swap = (state: CubeState, pairs: [number, number][]) => {
    const s = [...state] as Color[];
    for (const [a, b] of pairs) [s[a], s[b]] = [s[b], s[a]];
    return s;
  };
  const UF = [7, 19] as [number, number];      // U bottom-middle, F top-middle
  const UR = [5, 28] as [number, number];      // U middle-right, R top-middle
  const UFR = [8, 20, 27] as const;            // U, F, R stickers of the UFR corner

  it('rejects one flipped edge', () => {
    expect(validate(swap(createSolvedState(), [UF])).valid).toBe(false);
  });

  it('rejects one twisted corner', () => {
    const s = [...createSolvedState()] as Color[];
    const [u, f, r] = UFR.map((i) => s[i]);
    [s[UFR[0]], s[UFR[1]], s[UFR[2]]] = [f, r, u];
    expect(validate(s).valid).toBe(false);
  });

  it('rejects two swapped edges (parity)', () => {
    const s = swap(createSolvedState(), [[UF[0], UR[0]], [UF[1], UR[1]]]);
    expect(validate(s).valid).toBe(false);
  });

  it('rejects wrong colour counts', () => {
    const s = [...createSolvedState()] as Color[];
    s[0] = 5;
    expect(validate(s).valid).toBe(false);
  });
});

describe('serialize / deserialize', () => {
  it('round-trips', () => {
    const { state } = generateScramble(20);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('rejects bad input', () => {
    expect(deserialize('W'.repeat(53))).toBeNull();
    expect(deserialize('X'.repeat(54))).toBeNull();
  });
});

describe('parseAlgorithm', () => {
  it('parses face turns with primes and doubles', () => {
    expect(parseAlgorithm("  R U  R' F2\nD'  ")).toEqual({ moves: ['R', 'U', "R'", 'F2', "D'"] });
  });

  it('accepts typographic primes and R2\'', () => {
    expect(parseAlgorithm('R’ U′ F2\'')).toEqual({ moves: ["R'", "U'", 'F2'] });
  });

  it('returns no moves for empty input', () => {
    expect(parseAlgorithm('   ')).toEqual({ moves: [] });
  });

  it.each(['Rw', 'r', 'M', 'x', 'R3', 'u'])('rejects %s and names its position', (bad) => {
    const result = parseAlgorithm(`R U ${bad}`);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain(`Move 3 "${bad}"`);
  });

  it('a scramble then its inverse solves the cube', () => {
    const { moves } = generateScramble(25);
    const parsed = parseAlgorithm(`${moves.join(' ')} ${invert(moves).join(' ')}`);
    expect(isSolved(apply(createSolvedState(), (parsed as { moves: string[] }).moves))).toBe(true);
  });
});
