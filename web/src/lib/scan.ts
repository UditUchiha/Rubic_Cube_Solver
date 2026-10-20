import { FACE_NAMES, validate } from './cubeState';
import type { CubeState, Color } from './cubeState';
import { assignCubeColors } from './colorClassifier';
import type { RGB } from './colorClassifier';

/*
 * The 54-character state is not just six faces of colours — each face has a
 * fixed orientation inside it. Scanning a face rotated by 90 degrees produces a
 * cube that is correctly coloured and completely unsolvable, which used to be
 * the single most common way for a scan to fail: nothing on screen ever said
 * which way up to hold the cube.
 *
 * Derived from the sticker adjacencies in cubeState.ts: for each face, which
 * neighbouring face must sit along the top edge and the left edge of the view.
 */
export const FACE_ORIENTATION: { top: Color; left: Color }[] = [
  { top: 4, left: 1 }, // U (white):  orange up,  green left
  { top: 0, left: 4 }, // L (green):  white up,   orange left
  { top: 0, left: 1 }, // F (red):    white up,   green left
  { top: 0, left: 2 }, // R (blue):   white up,   red left
  { top: 0, left: 3 }, // B (orange): white up,   blue left
  { top: 2, left: 1 }, // D (yellow): red up,     green left
];

/* Sticker index (face * 9 + cell) -> colour the user picked by hand. */
export type Overrides = Record<number, Color>;

/* A face's samples were replaced, so corrections made against the old ones no longer apply. */
export function dropFace(overrides: Overrides, face: number): Overrides {
  const next = { ...overrides };
  for (let i = 0; i < 9; i++) delete next[face * 9 + i];
  return next;
}

function rotateFaceCW(state: CubeState, face: number): CubeState {
  const out = state.slice();
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) out[face * 9 + r * 3 + c] = state[face * 9 + (2 - c) * 3 + r];
  return out;
}

/*
 * Quarter-turns per face for every way of turning at most two faces, fewest
 * turned faces first. Measured on random scrambles: one turned face is
 * recovered 99.8% of the time, two 99.4%; allowing a third recovers nothing
 * more and only adds chances to turn a colour mistake into a different valid cube.
 */
const ROTATIONS: number[][] = (() => {
  const all: number[][] = [];
  for (let n = 1; n < 4096; n++) {
    const turns = [0, 1, 2, 3, 4, 5].map((f) => (n >> (2 * f)) & 3);
    if (turns.filter(Boolean).length <= 2) all.push(turns);
  }
  return all.sort((a, b) => a.filter(Boolean).length - b.filter(Boolean).length);
})();

/* The fewest face rotations that make `state` solvable, or null. */
export function fixRotatedFaces(state: CubeState): { state: CubeState; turns: number[] } | null {
  for (const turns of ROTATIONS) {
    let s = state;
    turns.forEach((k, f) => { for (let i = 0; i < k; i++) s = rotateFaceCW(s, f); });
    if (validate(s).valid) return { state: s, turns };
  }
  return null;
}

export interface ScanResult {
  state: CubeState;
  errors: string[]; // empty when the state is solvable
  notes: string[];  // what was corrected automatically, for the user to check
}

/* 54 samples in face order U L F R B D, plus the user's corrections. */
export function finishScan(samples: RGB[], overrides: Overrides): ScanResult {
  // Classify all 54 at once: only with the whole cube in hand does the exact
  // nine-per-colour quota apply, and that is what separates red from orange.
  const state = assignCubeColors(samples) as CubeState;
  Object.entries(overrides).forEach(([i, c]) => { state[Number(i)] = c; });
  for (let f = 0; f < 6; f++) state[f * 9 + 4] = f as Color;

  const { valid, errors } = validate(state);
  if (valid) return { state, errors: [], notes: [] };

  // A face held a quarter-turn off is the most common failure, and it is recoverable.
  const fixed = fixRotatedFaces(state);
  if (!fixed) return { state, errors, notes: [] };
  const notes = fixed.turns.flatMap((k, f) =>
    k === 0 ? [] : [`${FACE_NAMES[f]} face looked ${k === 2 ? 'upside down' : 'turned a quarter'} - corrected. Check it against your cube.`]
  );
  return { state: fixed.state, errors: [], notes };
}
