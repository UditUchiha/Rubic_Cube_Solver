import { describe, expect, it } from 'vitest';
import { resolveFaceTurn, Vec3 } from './faceTurn';
import { applyMove, createSolvedState, CubeState } from './cubeState';

// An oblique view from the front-right-top, so no face is seen edge-on and
// every face's two tangent axes land on different screen lines.
const project = ([x, y, z]: Vec3): [number, number] => [x - 0.5 * z, -y + 0.2 * x + 0.4 * z];

// State index of the sticker on cubie `p` facing `n` (RubiksCube3D's STICKER_FACES).
function stickerIndex([x, y, z]: Vec3, n: Vec3): number {
  if (n[1] === 1) return 0 * 9 + (z + 1) * 3 + (x + 1);
  if (n[1] === -1) return 5 * 9 + (1 - z) * 3 + (x + 1);
  if (n[2] === 1) return 2 * 9 + (1 - y) * 3 + (x + 1);
  if (n[2] === -1) return 4 * 9 + (1 - y) * 3 + (1 - x);
  if (n[0] === -1) return 1 * 9 + (1 - y) * 3 + (z + 1);
  return 3 * 9 + (1 - y) * 3 + (1 - z);
}

// +90° about +axis, right-handed; `times` 3 for -90°.
function rot90([x, y, z]: Vec3, axis: number, times: number): Vec3 {
  let v: Vec3 = [x, y, z];
  for (let i = 0; i < times; i++) {
    v = axis === 0 ? [v[0], -v[2], v[1]] : axis === 1 ? [v[2], v[1], -v[0]] : [-v[1], v[0], v[2]];
  }
  return v;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const scrambled: CubeState = ['R', 'U', "F'", 'L2', 'D', 'B', "R'", 'U2'].reduce(applyMove, createSolvedState());

/*
 * Dragging the sticker (pos, n) along tangent t should produce the move that
 * rotates its layer +90° about n × t, so the sticker's colour must end up
 * where that rotation carries the sticker. The engine is the ground truth.
 */
function checkDrag(pos: Vec3, n: Vec3, t: Vec3) {
  const [sx, sy] = project(t);
  const move = resolveFaceTurn({ normal: n, pos }, sx * 40, sy * 40, project);
  const a = cross(n, t);
  const axis = a.findIndex((c) => c !== 0);
  if (pos[axis] === 0) { expect(move).toBeNull(); return; }
  expect(move).not.toBeNull();
  const after = applyMove(scrambled, move!);
  const times = a[axis] > 0 ? 1 : 3;
  expect(after[stickerIndex(rot90(pos, axis, times), rot90(n, axis, times))]).toBe(scrambled[stickerIndex(pos, n)]);
}

describe('resolveFaceTurn', () => {
  it('turns the layer so the grabbed sticker follows the drag, on every face', () => {
    const faces: Vec3[] = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
    for (const n of faces) {
      const axis = n.findIndex((c) => c !== 0);
      const [u, v] = [0, 1, 2].filter((i) => i !== axis);
      for (const cu of [-1, 0, 1]) for (const cv of [-1, 0, 1]) {
        const pos: Vec3 = [0, 0, 0];
        pos[axis] = n[axis]; pos[u] = cu; pos[v] = cv;
        for (const [i, s] of [[u, 1], [u, -1], [v, 1], [v, -1]]) {
          const t: Vec3 = [0, 0, 0];
          t[i] = s;
          checkDrag(pos, n, t);
        }
      }
    }
  });

  it('reads the drag through the projection, not raw cube axes', () => {
    // Mirrored x: a screen-right drag is now a cube -x drag.
    const mirrored = ([x, y, z]: Vec3): [number, number] => [-x - 0.5 * z, -y + 0.2 * x + 0.4 * z];
    expect(resolveFaceTurn({ normal: [0, 0, 1], pos: [1, 1, 1] }, 30, 0, project)).toBe("U'");
    expect(resolveFaceTurn({ normal: [0, 0, 1], pos: [1, 1, 1] }, 30, 0, mirrored)).toBe('U');
  });

  it('ignores a zero-length drag', () => {
    expect(resolveFaceTurn({ normal: [0, 0, 1], pos: [1, 1, 1] }, 0, 0, project)).toBeNull();
  });
});
