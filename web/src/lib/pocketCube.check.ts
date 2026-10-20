/*
 * Self-check for the 2x2 solver. Not part of the app bundle. Run from web/:
 *   npx tsc src/lib/pocketCube.check.ts --outDir .check --module commonjs --target es2020 --skipLibCheck && node .check/pocketCube.check.js
 */

import type { Color, CubeState } from './cubeState';
import {
  applyMove, createSolvedState, depthCounts, generateScramble, isSolved, solve, validate,
} from './pocketCube';

function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(`FAIL: ${message}`);
}

// Published half-turn-metric distance distribution of the 2x2 (one corner fixed).
const EXPECTED = [1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644];

let started = performance.now();
const counts = depthCounts();
const buildMs = performance.now() - started;
assert(JSON.stringify(counts) === JSON.stringify(EXPECTED), `depth counts ${JSON.stringify(counts)}`);

const ALL = ['U', 'L', 'F', 'R', 'B', 'D'].flatMap((f) => [f, `${f}'`, `${f}2`]);
for (const m of ALL) {
  let s = createSolvedState();
  for (let i = 0; i < 4; i++) s = applyMove(s, m);
  assert(isSolved(s) && s.every((c, i) => c === Math.floor(i / 4)), `${m} x4 is identity`);
}

// Scrambles over all 18 moves also turn the cube in hand (L = R' plus a
// rotation), so this covers every holding orientation, not just DBL-fixed.
started = performance.now();
for (let t = 0; t < 500; t++) {
  let s = createSolvedState();
  for (let i = 0; i < 30; i++) s = applyMove(s, ALL[Math.floor(Math.random() * ALL.length)]);
  assert(validate(s).valid, `scramble ${t} validates: ${validate(s).errors}`);
  const moves = solve(s);
  assert(moves.length <= 11, `scramble ${t} solved in ${moves.length} > 11`);
  assert(isSolved(moves.reduce(applyMove, s)), `scramble ${t} solution replays to solved`);
}
const solveMs = (performance.now() - started) / 500;

// Optimality: a k-move scramble never needs more than k moves.
for (let t = 0; t < 200; t++) {
  const { state, moves } = generateScramble(1 + (t % 6));
  assert(solve(state).length <= moves.length, `short scramble ${moves.join(' ')}`);
}
assert(solve(createSolvedState()).length === 0, 'solved cube needs 0 moves');

// Twisting one corner in place, or swapping two stickers, must be rejected.
const twisted: CubeState = [...createSolvedState()];
[twisted[3], twisted[9], twisted[12]] = [twisted[9], twisted[12], twisted[3]]; // UFR facelets
assert(/twisted/.test(validate(twisted).errors.join()), `twist rejected: ${validate(twisted).errors}`);
const swapped: CubeState = [...createSolvedState()];
[swapped[0], swapped[23]] = [5 as Color, 0 as Color];
assert(!validate(swapped).valid, 'sticker swap rejected');
const wrongCount: CubeState = [...createSolvedState()];
wrongCount[0] = 2;
assert(/expected 4/.test(validate(wrongCount).errors.join()), 'colour count rejected');

console.log(`OK - table ${buildMs.toFixed(0)} ms, ${solveMs.toFixed(2)} ms/solve, depths ${counts.join(',')}`);
