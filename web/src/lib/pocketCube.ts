import type { Color, CubeState, ValidationResult } from './cubeState';
import {
  applyMove as applyMove3x3, CORNERS, CORNER_NAMES, CORNER_CHIRALITY, COLOR_NAMES,
} from './cubeState';

/*
 * 2x2 (Pocket Cube), solved optimally.
 *
 * Stickers use the 3x3 layout at size 2: face*4 + row*2 + col, faces U L F R B
 * D, colour index = home face. With no centres, "solved" is every face one
 * colour, in whichever orientation the cube happens to be held.
 *
 * The whole puzzle is 7! x 3^6 = 3,674,160 states once one corner is held
 * still, small enough to store the exact distance to solved for every state.
 * Solving is then a walk downhill through that table - no search, and the
 * result is provably shortest (11 moves at most, half-turn metric).
 */

// 3x3 cell -> 2x2 cell, for the 24 corner cells. A 2x2 face turn moves its
// stickers exactly as a 3x3 face turn moves the corner stickers.
const to2 = (i: number) => {
  const face = Math.floor(i / 9);
  const row = Math.floor((i % 9) / 3);
  const col = i % 3;
  return face * 4 + (row >> 1) * 2 + (col >> 1);
};
const CORNERS2 = CORNERS.map((slot) => slot.map(to2));

export function createSolvedState(): CubeState {
  return Array.from({ length: 24 }, (_, i) => Math.floor(i / 4) as Color);
}

const SOLVED = createSolvedState();

export function applyMove(state: CubeState, move: string): CubeState {
  const big = new Array<Color>(54).fill(0);
  CORNERS.forEach((slot, s) => slot.forEach((p, k) => { big[p] = state[CORNERS2[s][k]]; }));
  const turned = applyMove3x3(big, move);
  const next = new Array<Color>(24);
  CORNERS.forEach((slot, s) => slot.forEach((p, k) => { next[CORNERS2[s][k]] = turned[p]; }));
  return next;
}

export function isSolved(state: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    for (let i = 1; i < 4; i++) {
      if (state[f * 4 + i] !== state[f * 4]) return false;
    }
  }
  return true;
}

// ─── Corners ───────────────────────────────────────────────────────────────

const isUD = (c: number) => c === 0 || c === 5;
const OPPOSITE = [5, 3, 4, 1, 2, 0];
// DBL is the one corner U, R and F turns never touch.
const DBL = 7;

// Facelet order of each slot walked in one rotational direction; the 3x3
// tables list half the slots the other way round (see CORNER_CHIRALITY).
const handed = (slot: number) => (CORNER_CHIRALITY[slot] > 0 ? [0, 1, 2] : [0, 2, 1]);

const colourCycle = (state: CubeState, slot: number) =>
  handed(slot).map((k) => state[CORNERS2[slot][k]]);

const HOME_CYCLES = CORNERS2.map((_, slot) => colourCycle(SOLVED, slot));

/*
 * Which piece sits in `slot` (as its home slot) and its clockwise twist, or
 * null for a colour combination no real corner has - including a mirror image
 * of a real one.
 */
function readCorner(state: CubeState, slot: number): { home: number; twist: number } | null {
  const cycle = colourCycle(state, slot);
  if (cycle.filter(isUD).length !== 1) return null;
  const twist = cycle.findIndex(isUD);
  const canon = [0, 1, 2].map((k) => cycle[(twist + k) % 3]);
  const home = HOME_CYCLES.findIndex((h) => h.every((c, k) => c === canon[k]));
  return home === -1 ? null : { home, twist };
}

/*
 * Recolour the cube so the piece in DBL is the solved DBL piece. That fixes the
 * target orientation without a whole-cube rotation, so U/R/F moves found for
 * the recoloured cube are the same physical turns on the cube as held.
 * Null when DBL's colours cannot belong to one corner.
 */
function recolour(state: CubeState): CubeState | null {
  const [d, b, l] = CORNERS2[DBL].map((p) => state[p]);
  const face = new Array<number>(6).fill(-1);
  ([[d, 5], [b, 4], [l, 1]] as const).forEach(([colour, target]) => {
    face[colour] = target;
    face[OPPOSITE[colour]] = OPPOSITE[target];
  });
  if (face.includes(-1)) return null;
  return state.map((c) => face[c] as Color);
}

type Cubies = { perm: number[]; twist: number[] };

function readCubies(state: CubeState): Cubies | string {
  const perm: number[] = [];
  const twist: number[] = [];
  for (let slot = 0; slot < 8; slot++) {
    const corner = readCorner(state, slot);
    if (!corner) return `The ${CORNER_NAMES[slot]} corner has an impossible colour combination`;
    if (perm.includes(corner.home)) return `Two corners have the same colours (see ${CORNER_NAMES[slot]})`;
    perm.push(corner.home);
    twist.push(corner.twist);
  }
  if (twist.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return 'A corner is twisted in place - rotate one corner to fix it';
  }
  return { perm, twist };
}

function toCubies(state: CubeState): Cubies | string {
  const recoloured = recolour(state);
  if (!recoloured) return `The ${CORNER_NAMES[DBL]} corner has an impossible colour combination`;
  return readCubies(recoloured);
}

/*
 * A 2x2 has no parity law: any corner arrangement is reachable, so four of each
 * colour, eight real and distinct corners, and a twist total of 0 mod 3 are the
 * whole test.
 */
export function validate(state: CubeState): ValidationResult {
  if (state.length !== 24) return { valid: false, errors: ['State must have 24 cells'] };

  const errors: string[] = [];
  const counts = new Array(6).fill(0);
  for (const c of state) counts[c]++;
  counts.forEach((n, c) => {
    if (n !== 4) errors.push(`${COLOR_NAMES[c]}: expected 4, got ${n}`);
  });
  if (errors.length) return { valid: false, errors };

  const cubies = toCubies(state);
  return typeof cubies === 'string' ? { valid: false, errors: [cubies] } : { valid: true, errors: [] };
}

// ─── Distance table ────────────────────────────────────────────────────────

export const MOVES = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2'];

const N_PERM = 5040; // 7!: arrangements of the seven moving corners
const N_TWIST = 729; // 3^6: the seventh twist follows from the other six
const UNVISITED = 255;

// What each move does to cubies: slot s receives the piece from slot src[s],
// twisted a further d[s].
const ACTIONS = MOVES.map((move) => {
  const turned = readCubies(applyMove(SOLVED, move)) as Cubies;
  return { src: turned.perm, d: turned.twist };
});

// Lehmer code: rank among the n! orderings of 0..n-1.
function rankPerm(p: number[]): number {
  let rank = 0;
  for (let i = 0; i < p.length; i++) {
    let smaller = 0;
    for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++;
    rank = rank * (p.length - i) + smaller;
  }
  return rank;
}

function unrankPerm(rank: number, n: number): number[] {
  const digits = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = rank % (n - i);
    rank = Math.floor(rank / (n - i));
  }
  const left = Array.from({ length: n }, (_, i) => i);
  return digits.map((d) => left.splice(d, 1)[0]);
}

function rankTwist(twist: number[]): number {
  let rank = 0;
  for (let s = 5; s >= 0; s--) rank = rank * 3 + twist[s];
  return rank;
}

function unrankTwist(rank: number): number[] {
  const twist: number[] = [];
  for (let s = 0; s < 6; s++) {
    twist.push(rank % 3);
    rank = Math.floor(rank / 3);
  }
  twist.push((3 - (twist.reduce((a, b) => a + b, 0) % 3)) % 3);
  return twist;
}

const index = ({ perm, twist }: Cubies) => rankPerm(perm.slice(0, 7)) * N_TWIST + rankTwist(twist);

let permMove: Uint16Array[] = [];
let twistMove: Uint16Array[] = [];
let dist: Uint8Array | null = null;

const step = (i: number, m: number) =>
  permMove[m][Math.floor(i / N_TWIST)] * N_TWIST + twistMove[m][i % N_TWIST];

/*
 * Breadth-first from solved over all 3,674,160 states, recording each one's
 * distance. One byte per state; takes well under a second.
 */
export function buildTables(): void {
  if (dist) return;

  permMove = ACTIONS.map(({ src }) => {
    const table = new Uint16Array(N_PERM);
    for (let r = 0; r < N_PERM; r++) {
      const p = unrankPerm(r, 7);
      table[r] = rankPerm(src.slice(0, 7).map((s) => p[s]));
    }
    return table;
  });
  twistMove = ACTIONS.map(({ src, d }) => {
    const table = new Uint16Array(N_TWIST);
    for (let r = 0; r < N_TWIST; r++) {
      const t = unrankTwist(r);
      table[r] = rankTwist(src.slice(0, 7).map((s, slot) => (t[s] + d[slot]) % 3));
    }
    return table;
  });

  const table = new Uint8Array(N_PERM * N_TWIST).fill(UNVISITED);
  table[0] = 0;
  for (let depth = 0, found = 1; found > 0; depth++) {
    found = 0;
    for (let i = 0; i < table.length; i++) {
      if (table[i] !== depth) continue;
      for (let m = 0; m < MOVES.length; m++) {
        const j = step(i, m);
        if (table[j] === UNVISITED) {
          table[j] = depth + 1;
          found++;
        }
      }
    }
  }
  dist = table;
}

/** Depth histogram of the table, for self-checks. */
export function depthCounts(): number[] {
  buildTables();
  const counts: number[] = [];
  dist!.forEach((d) => { counts[d] = (counts[d] ?? 0) + 1; });
  return counts;
}

/** Shortest U/R/F move list that solves `state`. Throws on an impossible cube. */
export function solve(state: CubeState): string[] {
  buildTables();
  const cubies = toCubies(state);
  if (typeof cubies === 'string') throw new Error(cubies);

  const moves: string[] = [];
  let i = index(cubies);
  while (dist![i] > 0) {
    const m = MOVES.findIndex((_, m) => dist![step(i, m)] === dist![i] - 1);
    moves.push(MOVES[m]);
    i = step(i, m);
  }
  return moves;
}

export function generateScramble(moveCount = 10): { state: CubeState; moves: string[] } {
  let state = createSolvedState();
  const moves: string[] = [];
  let lastFace = -1;
  while (moves.length < moveCount) {
    const candidates = MOVES.filter((_, i) => Math.floor(i / 3) !== lastFace);
    const move = candidates[Math.floor(Math.random() * candidates.length)];
    state = applyMove(state, move);
    moves.push(move);
    lastFace = Math.floor(MOVES.indexOf(move) / 3);
  }
  return { state, moves };
}
