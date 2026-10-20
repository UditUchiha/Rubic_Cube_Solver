// Run from web/: npx --yes tsx scripts/scan-selfcheck.ts
import assert from 'node:assert/strict';
import { generateScramble, COLOR_HEX } from '../src/lib/cubeState';
import type { CubeState, Color } from '../src/lib/cubeState';
import { defaultCosts } from '../src/lib/colorClassifier';
import type { RGB } from '../src/lib/colorClassifier';
import { finishScan, dropFace, matchPhotosToFaces } from '../src/lib/scan';

let seed = 1; // mulberry32, so the run is repeatable
Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const hexToRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const samplesOf = (s: CubeState) => s.map((c) => hexToRgb(COLOR_HEX[c]));
// Own copy, so the check does not trust the code under test.
const turnCW = (s: CubeState, f: number) => s.map((c, i) =>
  Math.floor(i / 9) !== f ? c : s[f * 9 + (2 - (i % 3)) * 3 + Math.floor((i % 9) / 3)]) as CubeState;

for (let t = 0; t < 60; t++) {
  const { state } = generateScramble(25);

  const clean = finishScan(samplesOf(state), {});
  assert.deepEqual(clean.state, state);
  assert.deepEqual(clean.notes, []);

  let rotated = state;
  for (let k = 0; k <= t % 3; k++) rotated = turnCW(rotated, t % 6);
  const fixed = finishScan(samplesOf(rotated), {});
  assert.deepEqual(fixed.state, state, `face ${t % 6} not recovered`);
  assert.equal(fixed.notes.length, 1);
}

// Corrections beat the classifier: swap two stickers' samples, correct both by
// hand, and the original comes back. A centre can never be overridden.
const { state } = generateScramble(25);
const b = state.findIndex((c, i) => i % 9 !== 4 && c !== state[0]);
const swapped = samplesOf(state);
[swapped[0], swapped[b]] = [swapped[b], swapped[0]];
const r = finishScan(swapped, { 0: state[0], [b]: state[b], 4: 3 as Color });
assert.deepEqual(r.state, state);
assert.deepEqual(r.notes, []);

assert.deepEqual(dropFace({ 3: 1, 12: 2, 20: 0 } as Record<number, Color>, 1), { 3: 1, 20: 0 });

// Photos picked in any order land on their faces by centre colour.
const order = [3, 0, 5, 1, 4, 2];
assert.deepEqual(matchPhotosToFaces(order.map((c) => hexToRgb(COLOR_HEX[c])), [0, 1, 2, 3, 4, 5]), order);
// Fewer photos than faces: only the given faces are used.
assert.deepEqual(matchPhotosToFaces([hexToRgb(COLOR_HEX[5])], [2, 5]), [5]);
// Under warm light a red centre can sit nearer orange than red on its own; matched
// together with the real orange, the redder one still gets red.
const warmRed: RGB = [255, 90, 30], warmOrange: RGB = [255, 140, 20];
const nearest = (s: RGB) => { const c = defaultCosts(s); return c.indexOf(Math.min(...c)); };
assert.equal(nearest(warmRed), 4, 'test premise: warm red alone reads as orange');
assert.equal(nearest(warmOrange), 4);
assert.deepEqual(matchPhotosToFaces([warmOrange, warmRed], [2, 4]), [4, 2]);

console.log('scan self-check passed');
