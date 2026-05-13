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
      for (let i = 0; i < 3; i++) set(3, 0, 2 - i, tmp[2 - i]);
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
      for (let i = 0; i < 3; i++) set(4, i, 0, tmp[2 - i]);
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
      for (let i = 0; i < 3; i++) set(1, i, 0, tmp[2 - i]);
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
