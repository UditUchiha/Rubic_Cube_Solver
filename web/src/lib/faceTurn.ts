/*
 * Turns a drag on a sticker into a face move.
 *
 * Dragging a sticker along tangent t rotates its layer about a = n × t, where
 * n is the sticker's outward normal: for a point r on the face, rotation about
 * a moves it along a × r = t(n·r) − n(t·r), and n·r > 0 on that face, so the
 * sticker follows the drag. The layer is the slice through the sticker's
 * cubie perpendicular to a.
 */

export type Vec3 = [number, number, number];

export interface FaceGrab {
  /** Outward normal of the sticker's face, in cube coordinates. */
  normal: Vec3;
  /** Grid position of the sticker's cubie, each component in {-1, 0, 1}. */
  pos: Vec3;
}

const FACE_BY_AXIS: [string, string][] = [['R', 'L'], ['U', 'D'], ['F', 'B']]; // [+1 layer, -1 layer]

/**
 * `project` maps a direction in cube coordinates to the screen vector it
 * appears as (x right, y down). Returns null for a drag on a middle slice.
 */
export function resolveFaceTurn(
  grab: FaceGrab,
  dx: number,
  dy: number,
  project: (dir: Vec3) => [number, number],
): string | null {
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  // The best-aligned in-face axis, out of the four tangent directions.
  let best: Vec3 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 3; i++) {
    if (grab.normal[i] !== 0) continue;
    for (const sign of [1, -1]) {
      const t: Vec3 = [0, 0, 0];
      t[i] = sign;
      const [sx, sy] = project(t);
      const slen = Math.hypot(sx, sy);
      if (slen === 0) continue;
      const score = (sx * dx + sy * dy) / (slen * len);
      if (score > bestScore) { bestScore = score; best = t; }
    }
  }
  if (!best) return null;

  const n = grab.normal;
  const a: Vec3 = [
    n[1] * best[2] - n[2] * best[1],
    n[2] * best[0] - n[0] * best[2],
    n[0] * best[1] - n[1] * best[0],
  ];
  const axis = a.findIndex((c) => c !== 0);
  const layer = grab.pos[axis];
  // shortcut: middle slices (M/E/S) are not moves the engine has, so a drag there does nothing; add slice moves if users ask
  if (layer === 0) return null;

  const face = FACE_BY_AXIS[axis][layer > 0 ? 0 : 1];
  // A positive rotation about +axis is the prime of the +1 layer's face and
  // the plain move of the -1 layer's (matches MOVE_DEFS in RubiksCube3D).
  const prime = (layer > 0) === (a[axis] > 0);
  return prime ? `${face}'` : face;
}
