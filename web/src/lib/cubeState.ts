// Face indices: UP=0 LEFT=1 FRONT=2 RIGHT=3 BACK=4 DOWN=5
// Color values: WHITE=0 GREEN=1 RED=2 BLUE=3 ORANGE=4 YELLOW=5
// Cell index within state: face*9 + row*3 + col

export type Color = 0 | 1 | 2 | 3 | 4 | 5;
export type Face = 0 | 1 | 2 | 3 | 4 | 5;
export type CubeState = Color[];

export const COLOR_NAMES = ['White', 'Green', 'Red', 'Blue', 'Orange', 'Yellow'] as const;
export const COLOR_CHARS = ['W', 'G', 'R', 'B', 'O', 'Y'] as const;
export const COLOR_HEX = ['#FFFFFF', '#00D25A', '#FF3232', '#3264FF', '#FF8C00', '#FFE500'] as const;
export const FACE_NAMES = ['Up', 'Left', 'Front', 'Right', 'Back', 'Down'] as const;

// Center cell index for each face (row=1, col=1 → offset 4)
export const FACE_CENTERS: Color[] = [0, 1, 2, 3, 4, 5]; // W G R B O Y

export function idx(face: Face, row: number, col: number): number {
  return face * 9 + row * 3 + col;
}

export function createSolvedState(): CubeState {
  const state: Color[] = new Array(54);
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 9; i++) {
      state[face * 9 + i] = face as Color;
    }
  }
  return state;
}

export function serialize(state: CubeState): string {
  return state.map((c) => COLOR_CHARS[c]).join('');
}

export function deserialize(str: string): CubeState | null {
  if (str.length !== 54) return null;
  const state: Color[] = new Array(54);
  for (let i = 0; i < 54; i++) {
    const ci = COLOR_CHARS.indexOf(str[i].toUpperCase() as typeof COLOR_CHARS[number]);
    if (ci === -1) return null;
    state[i] = ci as Color;
  }
  return state;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Parity helpers ────────────────────────────────────────────────────────
// Corner sticker positions: [U/D_sticker, second, third]
// Ported from RubiksCube.cpp::getCornerColorString()
const CORNERS: [number, number, number][] = [
  [8, 20, 27],  // UFR: U[2][2], F[0][2], R[0][0]
  [6, 18, 11],  // UFL: U[2][0], F[0][0], L[0][2]
  [0, 38,  9],  // UBL: U[0][0], B[0][2], L[0][0]
  [2, 36, 29],  // UBR: U[0][2], B[0][0], R[0][2]
  [47, 26, 33], // DFR: D[0][2], F[2][2], R[2][0]
  [45, 24, 17], // DFL: D[0][0], F[2][0], L[2][2]
  [53, 42, 35], // DBR: D[2][2], B[2][0], R[2][2]
  [51, 44, 15], // DBL: D[2][0], B[2][2], L[2][0]
];

// Edge sticker positions: [primary, secondary]
// Primary = U/D sticker for top/bottom edges, F sticker for equatorial
const EDGES: [number, number][] = [
  [7,  19], // UF: U[2][1], F[0][1]
  [5,  28], // UR: U[1][2], R[0][1]
  [1,  37], // UB: U[0][1], B[0][1]
  [3,  10], // UL: U[1][0], L[0][1]
  [46, 25], // DF: D[0][1], F[2][1]
  [50, 34], // DR: D[1][2], R[2][1]
  [52, 43], // DB: D[2][1], B[2][1]
  [48, 16], // DL: D[1][0], L[2][1]
  [23, 30], // FR: F[1][2], R[1][0]
  [21, 14], // FL: F[1][0], L[1][2]
  [39, 32], // BR: B[1][0], R[1][2]
  [41, 12], // BL: B[1][2], L[1][0]
];

function getCornerPieceId(state: CubeState, ci: number): number {
  const colors = CORNERS[ci].map((p) => state[p]);
  let id = 0;
  if (colors.includes(5)) id |= 4; // Yellow
  if (colors.includes(4)) id |= 2; // Orange
  if (colors.includes(1)) id |= 1; // Green
  return id;
}

function getEdgePieceId(state: CubeState, ei: number): number {
  const [a, b] = EDGES[ei];
  const lo = Math.min(state[a], state[b]);
  const hi = Math.max(state[a], state[b]);
  return lo * 6 + hi;
}

function permParity(perm: number[]): number {
  const visited = new Array(perm.length).fill(false);
  let swaps = 0;
  for (let i = 0; i < perm.length; i++) {
    if (visited[i]) continue;
    let len = 0, j = i;
    while (!visited[j]) { visited[j] = true; j = perm[j]; len++; }
    swaps += len - 1;
  }
  return swaps % 2;
}

function checkCornerOrientationParity(state: CubeState): boolean {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const colors = CORNERS[i].map((p) => state[p]);
    const wyIdx = colors.findIndex((c) => c === 0 || c === 5);
    sum += wyIdx === -1 ? 0 : wyIdx;
  }
  return sum % 3 === 0;
}

function checkEdgeOrientationParity(state: CubeState): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const primary = state[EDGES[i][0]];
    let bad: boolean;
    if (i < 8) {
      // Top/bottom edge: good if U/D-face sticker is White(0) or Yellow(5)
      bad = primary !== 0 && primary !== 5;
    } else {
      // Equatorial edge: good if F-face sticker is Red(2) or Orange(4)
      bad = primary !== 2 && primary !== 4;
    }
    if (bad) sum++;
  }
  return sum % 2 === 0;
}

function checkPermutationParity(state: CubeState): boolean {
  // Build solved-state piece-id arrays as canonical indices
  const solved = createSolvedState();
  const solvedCIds = CORNERS.map((_, i) => getCornerPieceId(solved, i));
  const solvedEIds = EDGES.map((_, i) => getEdgePieceId(solved, i));

  const cIdToPos = new Map(solvedCIds.map((id, pos) => [id, pos]));
  const eIdToPos = new Map(solvedEIds.map((id, pos) => [id, pos]));

  const cPerm = CORNERS.map((_, i) => cIdToPos.get(getCornerPieceId(state, i)) ?? i);
  const ePerm = EDGES.map((_, i) => eIdToPos.get(getEdgePieceId(state, i)) ?? i);

  return permParity(cPerm) === permParity(ePerm);
}
// ───────────────────────────────────────────────────────────────────────────

export function validate(state: CubeState): ValidationResult {
  const errors: string[] = [];

  if (state.length !== 54) {
    return { valid: false, errors: ['State must have 54 cells'] };
  }

  // Count each color
  const counts = new Array(6).fill(0);
  for (const c of state) counts[c]++;
  for (let c = 0; c < 6; c++) {
    if (counts[c] !== 9) {
      errors.push(`${COLOR_NAMES[c]}: expected 9, got ${counts[c]}`);
    }
  }

  // Centers must match their face
  for (let face = 0; face < 6; face++) {
    const centerCell = state[face * 9 + 4];
    if (centerCell !== face) {
      errors.push(
        `${FACE_NAMES[face]} center must be ${COLOR_NAMES[face]}, got ${COLOR_NAMES[centerCell]}`
      );
    }
  }

  // Only run parity checks when counts and centers are valid
  if (errors.length === 0) {
    if (!checkCornerOrientationParity(state)) {
      errors.push('Corner orientation parity error — a corner piece has been twisted');
    }
    if (!checkEdgeOrientationParity(state)) {
      errors.push('Edge orientation parity error — an edge piece has been flipped');
    }
    if (!checkPermutationParity(state)) {
      errors.push('Permutation parity error — two pieces have been swapped');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getFaceColors(state: CubeState, face: Face): Color[] {
  return state.slice(face * 9, face * 9 + 9);
}

export function setCell(
  state: CubeState,
  face: Face,
  row: number,
  col: number,
  color: Color
): CubeState {
  const next = [...state] as CubeState;
  next[idx(face, row, col)] = color;
  return next;
}

// Rotate a face clockwise (ported from RubiksCube3dArray::rotateFace)
function rotateFace(state: Color[], faceIdx: number): void {
  const base = faceIdx * 9;
  const tmp = state.slice(base, base + 9);
  // row 0 of result = col 0 of tmp, bottom to top
  for (let i = 0; i < 3; i++) state[base + i] = tmp[(2 - i) * 3 + 0];
  // col 2 of result = row 0 of tmp, left to right
  for (let i = 0; i < 3; i++) state[base + i * 3 + 2] = tmp[0 * 3 + i];
  // row 2 of result = col 2 of tmp, top to bottom reversed
  for (let i = 0; i < 3; i++) state[base + 2 * 3 + (2 - i)] = tmp[i * 3 + 2];
  // col 0 of result = row 2 of tmp, right to left
  for (let i = 0; i < 3; i++) state[base + (2 - i) * 3 + 0] = tmp[2 * 3 + (2 - i)];
}

// Apply a single move. Ported exactly from RubiksCube3dArray.cpp move methods.
export function applyMove(state: CubeState, move: string): CubeState {
  const s = [...state] as Color[];
  const g = (face: number, row: number, col: number) => s[face * 9 + row * 3 + col];
  const set = (face: number, row: number, col: number, v: Color) => {
    s[face * 9 + row * 3 + col] = v;
  };

  switch (move) {
    case 'U': {
      rotateFace(s, 0);
      const tmp = [g(4, 0, 2), g(4, 0, 1), g(4, 0, 0)];
      for (let i = 0; i < 3; i++) set(4, 0, 2 - i, g(1, 0, 2 - i));
      for (let i = 0; i < 3; i++) set(1, 0, 2 - i, g(2, 0, 2 - i));
      for (let i = 0; i < 3; i++) set(2, 0, 2 - i, g(3, 0, 2 - i));
      for (let i = 0; i < 3; i++) set(3, 0, 2 - i, tmp[i]);
      break;
    }
    case "U'": {
      applyMove3(s, 'U'); break;
    }
    case 'U2': {
      const t1 = applyMove([...state] as CubeState, 'U');
      return applyMove(t1, 'U');
    }
    case 'L': {
      rotateFace(s, 1);
      const tmp = [g(0, 0, 0), g(0, 1, 0), g(0, 2, 0)];
      for (let i = 0; i < 3; i++) set(0, i, 0, g(4, 2 - i, 2));
      for (let i = 0; i < 3; i++) set(4, 2 - i, 2, g(5, i, 0));
      for (let i = 0; i < 3; i++) set(5, i, 0, g(2, i, 0));
      for (let i = 0; i < 3; i++) set(2, i, 0, tmp[i]);
      break;
    }
    case "L'": { applyMove3(s, 'L'); break; }
    case 'L2': {
      const t1 = applyMove([...state] as CubeState, 'L');
      return applyMove(t1, 'L');
    }
    case 'F': {
      rotateFace(s, 2);
      const tmp = [g(0, 2, 0), g(0, 2, 1), g(0, 2, 2)];
      for (let i = 0; i < 3; i++) set(0, 2, i, g(1, 2 - i, 2));
      for (let i = 0; i < 3; i++) set(1, 2 - i, 2, g(5, 0, 2 - i));
      for (let i = 0; i < 3; i++) set(5, 0, 2 - i, g(3, i, 0));
      for (let i = 0; i < 3; i++) set(3, i, 0, tmp[i]);
      break;
    }
    case "F'": { applyMove3(s, 'F'); break; }
    case 'F2': {
      const t1 = applyMove([...state] as CubeState, 'F');
      return applyMove(t1, 'F');
    }
    case 'R': {
      rotateFace(s, 3);
      const tmp = [g(0, 2, 2), g(0, 1, 2), g(0, 0, 2)];
      for (let i = 0; i < 3; i++) set(0, 2 - i, 2, g(2, 2 - i, 2));
      for (let i = 0; i < 3; i++) set(2, 2 - i, 2, g(5, 2 - i, 2));
      for (let i = 0; i < 3; i++) set(5, 2 - i, 2, g(4, i, 0));
      for (let i = 0; i < 3; i++) set(4, i, 0, tmp[i]);
      break;
    }
    case "R'": { applyMove3(s, 'R'); break; }
    case 'R2': {
      const t1 = applyMove([...state] as CubeState, 'R');
      return applyMove(t1, 'R');
    }
    case 'B': {
      rotateFace(s, 4);
      const tmp = [g(0, 0, 2), g(0, 0, 1), g(0, 0, 0)];
      for (let i = 0; i < 3; i++) set(0, 0, 2 - i, g(3, 2 - i, 2));
      for (let i = 0; i < 3; i++) set(3, 2 - i, 2, g(5, 2, i));
      for (let i = 0; i < 3; i++) set(5, 2, i, g(1, i, 0));
      for (let i = 0; i < 3; i++) set(1, i, 0, tmp[i]);
      break;
    }
    case "B'": { applyMove3(s, 'B'); break; }
    case 'B2': {
      const t1 = applyMove([...state] as CubeState, 'B');
      return applyMove(t1, 'B');
    }
    case 'D': {
      rotateFace(s, 5);
      const tmp = [g(2, 2, 0), g(2, 2, 1), g(2, 2, 2)];
      for (let i = 0; i < 3; i++) set(2, 2, i, g(1, 2, i));
      for (let i = 0; i < 3; i++) set(1, 2, i, g(4, 2, i));
      for (let i = 0; i < 3; i++) set(4, 2, i, g(3, 2, i));
      for (let i = 0; i < 3; i++) set(3, 2, i, tmp[i]);
      break;
    }
    case "D'": { applyMove3(s, 'D'); break; }
    case 'D2': {
      const t1 = applyMove([...state] as CubeState, 'D');
      return applyMove(t1, 'D');
    }
    default:
      break;
  }

  return s;
}

// Apply a move 3 times in-place (used for prime moves)
function applyMove3(s: Color[], move: string): void {
  const base = move as string;
  let tmp = [...s] as CubeState;
  tmp = applyMove(tmp, base);
  tmp = applyMove(tmp, base);
  tmp = applyMove(tmp, base);
  for (let i = 0; i < 54; i++) s[i] = tmp[i];
}

export function computeCubeStates(initial: CubeState, moves: string[]): CubeState[] {
  const states: CubeState[] = [initial];
  let current = initial;
  for (const move of moves) {
    current = applyMove(current, move);
    states.push(current);
  }
  return states;
}

export function isSolved(state: CubeState): boolean {
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 9; i++) {
      if (state[face * 9 + i] !== face) return false;
    }
  }
  return true;
}

const ALL_MOVES = [
  'U', "U'", 'U2',
  'L', "L'", 'L2',
  'F', "F'", 'F2',
  'R', "R'", 'R2',
  'B', "B'", 'B2',
  'D', "D'", 'D2',
] as const;

const MOVE_FACE: Record<string, number> = {
  'U': 0, "U'": 0, 'U2': 0,
  'L': 1, "L'": 1, 'L2': 1,
  'F': 2, "F'": 2, 'F2': 2,
  'R': 3, "R'": 3, 'R2': 3,
  'B': 4, "B'": 4, 'B2': 4,
  'D': 5, "D'": 5, 'D2': 5,
};

export function generateScramble(moveCount = 20): { state: CubeState; moves: string[] } {
  let state = createSolvedState();
  const moves: string[] = [];
  let lastFace = -1;

  while (moves.length < moveCount) {
    const candidates = ALL_MOVES.filter((m) => MOVE_FACE[m] !== lastFace);
    const move = candidates[Math.floor(Math.random() * candidates.length)];
    state = applyMove(state, move);
    moves.push(move);
    lastFace = MOVE_FACE[move];
  }

  return { state, moves };
}
