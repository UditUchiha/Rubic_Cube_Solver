import Cube from 'cubejs';

// Initialize the Kociemba solver pruning tables in memory
let solverInitialized = false;

export function initSolver() {
  if (!solverInitialized) {
    Cube.initSolver();
    solverInitialized = true;
  }
}

/**
 * Converts our internal state array (54 integers) to a Cube.js string format.
 * Our format:   [U(0..8), L(9..17), F(18..26), R(27..35), B(36..44), D(45..53)]
 * Cube.js format: string of length 54 in order U, R, F, D, L, B.
 * Letters are determined by the center colors of each face.
 */
export function stateToCubejsString(state: number[]): string {
  if (state.length !== 54) throw new Error('State must be exactly 54 elements');

  const U = state.slice(0, 9);
  const L = state.slice(9, 18);
  const F = state.slice(18, 27);
  const R = state.slice(27, 36);
  const B = state.slice(36, 45);
  const D = state.slice(45, 54);

  // Determine which number maps to which face character based on center colors
  const centers: Record<number, string> = {
    [U[4]]: 'U',
    [L[4]]: 'L',
    [F[4]]: 'F',
    [R[4]]: 'R',
    [B[4]]: 'B',
    [D[4]]: 'D',
  };

  return [
    ...U.map((c) => centers[c]),
    ...R.map((c) => centers[c]),
    ...F.map((c) => centers[c]),
    ...D.map((c) => centers[c]),
    ...L.map((c) => centers[c]),
    ...B.map((c) => centers[c]),
  ].join('');
}

/**
 * Solves a given cube state using the Kociemba Two-Phase algorithm.
 * Returns an array of moves (e.g., ["R2", "U", "F'", ...])
 */
export function solveCube(state: number[]): string[] {
  initSolver();

  const cubeStr = stateToCubejsString(state);
  const cube = Cube.fromString(cubeStr);
  
  // solve() returns a string like "R2 U F' B2 D"
  const solutionStr = cube.solve();
  
  // In the very rare case the cube is already solved, it returns an empty string
  if (!solutionStr || solutionStr.trim() === '') return [];
  
  return solutionStr.trim().split(/\s+/);
}
