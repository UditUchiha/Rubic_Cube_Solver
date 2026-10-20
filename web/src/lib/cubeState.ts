// Face indices: UP=0 LEFT=1 FRONT=2 RIGHT=3 BACK=4 DOWN=5
// Color values: WHITE=0 GREEN=1 RED=2 BLUE=3 ORANGE=4 YELLOW=5
// Cell index within state: face*9 + row*3 + col
// A 2x2 uses the same face order and orientation with 24 cells: face*4 + row*2 + col.
// The array length is what tells the two apart.

export type Color = 0 | 1 | 2 | 3 | 4 | 5;
export type Face = 0 | 1 | 2 | 3 | 4 | 5;
export type CubeState = Color[];
export type CubeSize = 2 | 3;

export function cubeSize(state: CubeState): CubeSize {
  return state.length === 24 ? 2 : 3;
}

export const COLOR_NAMES = ['White', 'Green', 'Red', 'Blue', 'Orange', 'Yellow'] as const;
export const COLOR_CHARS = ['W', 'G', 'R', 'B', 'O', 'Y'] as const;
export const COLOR_HEX = ['#FFFFFF', '#00D25A', '#FF3232', '#3264FF', '#FF8C00', '#FFE500'] as const;
export const FACE_NAMES = ['Up', 'Left', 'Front', 'Right', 'Back', 'Down'] as const;

// Center cell index for each face (row=1, col=1 → offset 4)
export const FACE_CENTERS: Color[] = [0, 1, 2, 3, 4, 5]; // W G R B O Y

export function idx(face: Face, row: number, col: number): number {
  return face * 9 + row * 3 + col;
}

export function createSolvedState(n: CubeSize = 3): CubeState {
  const cells = n * n;
  const state: Color[] = new Array(6 * cells);
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < cells; i++) {
      state[face * cells + i] = face as Color;
    }
  }
  return state;
}

export function serialize(state: CubeState): string {
  return state.map((c) => COLOR_CHARS[c]).join('');
}

export function deserialize(str: string): CubeState | null {
  if (str.length !== 54 && str.length !== 24) return null;
  const state: Color[] = new Array(str.length);
  for (let i = 0; i < str.length; i++) {
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
export const CORNERS: [number, number, number][] = [
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
export const EDGES: [number, number][] = [
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

export const CORNER_NAMES = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBR', 'DBL'] as const;
const EDGE_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'] as const;

/*
 * Chirality of each corner slot, in the CORNERS order above. Taking the three
 * face normals in the order each triple lists them, UFR/UBL/DFL/DBR form a
 * right-handed cycle and UFL/UBR/DFR/DBL a left-handed one. Corner twist is
 * only invariant once the left-handed slots are counted the other way round -
 * summed raw, the total spreads evenly over 0/1/2 and carries no information.
 * Mirrors CORNER_CHIRALITY in Model/CubeValidation.h.
 */
export const CORNER_CHIRALITY = [+1, -1, +1, -1, -1, +1, +1, -1];

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

/*
 * Twist of the corner sitting in slot `ci`: how far its white/yellow sticker is
 * from the slot's U/D facelet, corrected for the slot's chirality. Returns -1
 * when the slot does not hold a real corner.
 */
function getCornerTwist(state: CubeState, ci: number): number {
  const colors = CORNERS[ci].map((p) => state[p]);
  const udCount = colors.filter((c) => c === 0 || c === 5).length;
  if (udCount !== 1) return -1;
  const at = colors.findIndex((c) => c === 0 || c === 5);
  return CORNER_CHIRALITY[ci] > 0 ? at : (3 - at) % 3;
}

/*
 * Flip of the edge sitting in slot `ei`: 0 when its reference sticker faces the
 * slot's reference facelet. For an edge carrying white or yellow the reference
 * sticker is that one; for the four equatorial edges it is red or orange.
 * Returns -1 when the slot does not hold a real edge.
 */
function getEdgeFlip(state: CubeState, ei: number): number {
  const [a, b] = EDGES[ei];
  const c1 = state[a];
  const c2 = state[b];
  const isUD = (c: Color) => c === 0 || c === 5; // White / Yellow
  const isFB = (c: Color) => c === 2 || c === 4; // Red / Orange
  if (isUD(c1) && isUD(c2)) return -1; // white+yellow is not a real edge
  if (isUD(c1) || isUD(c2)) return isUD(c1) ? 0 : 1;
  if (isFB(c1) && isFB(c2)) return -1; // red+orange is not a real edge
  if (isFB(c1) || isFB(c2)) return isFB(c1) ? 0 : 1;
  return -1; // green+blue is not a real edge
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

/*
 * The three laws that decide whether a coloured-in cube can actually be turned
 * back to solved. Nine of each colour plus correct centres only narrows things
 * to a set twelve times larger than the reachable one; these checks pick out
 * the reachable twelfth.
 *
 * Worth doing properly on the client: the solver cannot fail fast on an
 * impossible cube. It searches all the way to the God's-number bound, holding
 * the single solver process until the request times out, so a cube rejected
 * here saves the user a minute of waiting for an error.
 */
function checkCubeLaws(state: CubeState): string[] {
  const solved = createSolvedState();
  const cIdToPos = new Map(CORNERS.map((_, i) => [getCornerPieceId(solved, i), i]));
  const eIdToPos = new Map(EDGES.map((_, i) => [getEdgePieceId(solved, i), i]));

  const cPerm: number[] = [];
  const ePerm: number[] = [];
  const cSeen = new Set<number>();
  const eSeen = new Set<number>();
  let twistSum = 0;
  let flipSum = 0;

  for (let i = 0; i < 8; i++) {
    const twist = getCornerTwist(state, i);
    const home = cIdToPos.get(getCornerPieceId(state, i));
    if (twist === -1 || home === undefined) {
      return [`The ${CORNER_NAMES[i]} corner has an impossible colour combination`];
    }
    if (cSeen.has(home)) {
      return [`Two corners have the same colours (see ${CORNER_NAMES[i]})`];
    }
    cSeen.add(home);
    cPerm.push(home);
    twistSum += twist;
  }

  for (let i = 0; i < 12; i++) {
    const flip = getEdgeFlip(state, i);
    const home = eIdToPos.get(getEdgePieceId(state, i));
    if (flip === -1 || home === undefined) {
      return [`The ${EDGE_NAMES[i]} edge has an impossible colour combination`];
    }
    if (eSeen.has(home)) {
      return [`Two edges have the same colours (see ${EDGE_NAMES[i]})`];
    }
    eSeen.add(home);
    ePerm.push(home);
    flipSum += flip;
  }

  const errors: string[] = [];
  if (twistSum % 3 !== 0) {
    errors.push('A corner is twisted in place - rotate one corner to fix it');
  }
  if (flipSum % 2 !== 0) {
    errors.push('An edge is flipped in place - turn one edge around to fix it');
  }
  if (permParity(cPerm) !== permParity(ePerm)) {
    errors.push('Two pieces are swapped - corner and edge parity disagree');
  }
  return errors;
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

  // The piece-level laws only mean anything once colour counts and centres are
  // right, so they run last.
  if (errors.length === 0) {
    errors.push(...checkCubeLaws(state));
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
  const n = cubeSize(state);
  const next = [...state] as CubeState;
  next[face * n * n + row * n + col] = color;
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

// Apply a single face turn to a 3x3 or 2x2 state.
export function applyMove(state: CubeState, move: string): CubeState {
  if (state.length === 24) {
    const perm = move2x2Permutation(move);
    return perm ? perm.map((i) => state[i]) : [...state];
  }
  return applyMove3x3(state, move);
}

/*
 * A 2x2 sticker is a 3x3 corner sticker: (face, r, c) -> (face, 2r, 2c), and
 * 3x3 face turns only ever move corner stickers onto corner stickers. So each
 * 2x2 move is read off the 3x3 engine by turning a labelled cube once, rather
 * than written out a second time by hand.
 */
const CELL_2X2_TO_3X3 = Array.from({ length: 24 }, (_, i) => {
  const face = Math.floor(i / 4);
  const row = Math.floor((i % 4) / 2);
  const col = i % 2;
  return face * 9 + row * 6 + col * 2;
});
const perms2x2 = new Map<string, number[]>();

/* For 2x2 move m: next[k] = state[perm[k]]. Undefined for a non-face-turn. */
export function move2x2Permutation(move: string): number[] | undefined {
  if (!(move in MOVE_FACE)) return undefined;
  let perm = perms2x2.get(move);
  if (!perm) {
    const labels = Array.from({ length: 54 }, (_, i) => i) as unknown as CubeState;
    const moved = applyMove3x3(labels, move) as unknown as number[];
    perm = CELL_2X2_TO_3X3.map((cell) => CELL_2X2_TO_3X3.indexOf(moved[cell]));
    perms2x2.set(move, perm);
  }
  return perm;
}

// Ported exactly from RubiksCube3dArray.cpp move methods.
function applyMove3x3(state: CubeState, move: string): CubeState {
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
  // A 2x2 has no centres, so any orientation with uniform faces is solved.
  if (state.length === 24) {
    return state.every((c, i) => c === state[i - (i % 4)]);
  }
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

/*
 * Default depth is 12, not 20. The solver returns a provably optimal solution,
 * and that costs roughly 5-8x more per extra move: 12 comes back in well under
 * a second, 13 takes 10-20s, and from about 15 it runs past any request
 * timeout worth setting. A 20-move scramble simply never came back.
 */
export function generateScramble(moveCount = 12, n: CubeSize = 3): { state: CubeState; moves: string[] } {
  let state = createSolvedState(n);
  const moves: string[] = [];
  let lastFace = -1;
  let beforeLastFace = -1;

  // Opposite faces commute, so U D U collapses to two moves. Skipping both the
  // same face twice running and a face repeated across a commuting pair keeps a
  // depth-N scramble genuinely about N moves deep instead of quietly shallower.
  const OPPOSITE: Record<number, number> = { 0: 5, 5: 0, 1: 3, 3: 1, 2: 4, 4: 2 };

  while (moves.length < moveCount) {
    const candidates = ALL_MOVES.filter((m) => {
      const f = MOVE_FACE[m];
      if (f === lastFace) return false;
      if (f === beforeLastFace && OPPOSITE[lastFace] === f) return false;
      return true;
    });
    const move = candidates[Math.floor(Math.random() * candidates.length)];
    state = applyMove(state, move);
    moves.push(move);
    beforeLastFace = lastFace;
    lastFace = MOVE_FACE[move];
  }

  return { state, moves };
}

/*
 * Parse face-turn notation such as "R U R' F2". Only the 18 face moves are
 * accepted: wide moves, slices and rotations move the centres, and this
 * project's state layout fixes each centre to its face. applyMove silently
 * ignores unknown moves, so rejecting them here is what stops a typo from
 * producing a wrong cube.
 */
export function parseAlgorithm(text: string): { moves: string[] } | { error: string } {
  const tokens = text.replace(/[’′`]/g, "'").split(/\s+/).filter(Boolean);
  const moves: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const move = tokens[i].replace(/^([ULFRBD])2'$/, '$12');
    if (!(move in MOVE_FACE)) {
      return { error: `Move ${i + 1} "${tokens[i]}" is not a face turn (use U L F R B D with ' or 2)` };
    }
    moves.push(move);
  }
  return { moves };
}
