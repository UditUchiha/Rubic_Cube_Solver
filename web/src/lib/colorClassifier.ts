import type { Color } from './cubeState';

export type RGB = [number, number, number];

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6 * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }

  return [h, s, v];
}

/*
 * Fallback reference colours in HSV, used only until the scan has seen the
 * real centres. Hue for white is meaningless, which the distance function
 * handles by weighting hue by saturation.
 */
const DEFAULT_REFERENCES: [number, number, number][] = [
  [0, 0.04, 0.92],   // 0 White
  [130, 0.70, 0.55], // 1 Green
  [2, 0.85, 0.70],   // 2 Red
  [218, 0.80, 0.62], // 3 Blue
  [24, 0.90, 0.78],  // 4 Orange
  [52, 0.85, 0.88],  // 5 Yellow
];

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/*
 * Distance between an observed sticker and a reference colour.
 *
 * Hue is scaled by the weaker of the two saturations, so a washed-out or grey
 * sample is not pushed toward a random hue — that is what lets white be told
 * apart from a dim colour instead of matching whichever hue it drifted to.
 */
function colorDistance(
  sample: [number, number, number],
  ref: [number, number, number]
): number {
  const [h1, s1, v1] = sample;
  const [h2, s2, v2] = ref;
  const hueTerm = (hueDistance(h1, h2) / 180) ** 2 * Math.min(s1, s2) * 6.0;
  const satTerm = (s1 - s2) ** 2 * 1.6;
  const valTerm = (v1 - v2) ** 2 * 0.8;
  return hueTerm + satTerm + valTerm;
}

/*
 * Single-sample classification. Kept for live previews, where only one sticker
 * is in hand. Prefer assignFaceColors / assignCubeColors when a whole face or
 * cube is available: deciding each sticker on its own is what makes red and
 * orange flip under warm lighting.
 */
export function classifyColor(r: number, g: number, b: number, references = DEFAULT_REFERENCES): Color {
  const hsv = rgbToHsv(r, g, b);
  let best: Color = 0;
  let bestDist = Infinity;
  for (let c = 0; c < 6; c++) {
    const d = colorDistance(hsv, references[c]);
    if (d < bestDist) { bestDist = d; best = c as Color; }
  }
  return best;
}

/* Cost of `sample` against each default colour, for matching photos to faces before any calibration exists. */
export function defaultCosts([r, g, b]: RGB): number[] {
  const hsv = rgbToHsv(r, g, b);
  return DEFAULT_REFERENCES.map((ref) => colorDistance(hsv, ref));
}

/*
 * Assign colours to a group of samples under a quota: at most `perColor` of
 * each. A Rubik's cube has exactly nine stickers of every colour, and a face
 * shows at most nine, so the counts are known in advance and worth enforcing.
 *
 * Stickers are decided in order of confidence — the gap between their best and
 * second-best match — so the unambiguous ones claim their colour first and the
 * genuinely ambiguous ones (almost always a red/orange pair) are left to take
 * whatever the quota still allows. That turns the hardest local decision into
 * an easy global one.
 */
function assignUnderQuota(
  samples: RGB[],
  references: [number, number, number][],
  perColor: number[]
): Color[] {
  const n = samples.length;
  const hsv = samples.map(([r, g, b]) => rgbToHsv(r, g, b));
  const costs = hsv.map((s) => references.map((ref) => colorDistance(s, ref)));

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const sa = [...costs[a]].sort((x, y) => x - y);
    const sb = [...costs[b]].sort((x, y) => x - y);
    return (sb[1] - sb[0]) - (sa[1] - sa[0]); // widest margin first
  });

  const remaining = [...perColor];
  const result = new Array<Color>(n).fill(0);

  for (const i of order) {
    let best: Color = 0;
    let bestCost = Infinity;
    for (let c = 0; c < 6; c++) {
      if (remaining[c] <= 0) continue;
      if (costs[i][c] < bestCost) { bestCost = costs[i][c]; best = c as Color; }
    }
    result[i] = best;
    remaining[best]--;
  }

  return result;
}

/*
 * Build reference colours from centre stickers that have already been seen.
 * A centre's true colour is fixed by the face it sits on, so every captured
 * centre is a free, correctly labelled sample of what that colour looks like
 * under the light the user is actually standing in — far better than constants
 * baked in from some other room.
 */
export function buildReferences(centreSamples: (RGB | null)[]): [number, number, number][] {
  return DEFAULT_REFERENCES.map((fallback, c) => {
    const sample = centreSamples[c];
    if (!sample) return fallback;
    const [h, s, v] = rgbToHsv(sample[0], sample[1], sample[2]);
    // Keep a little of the prior so one badly-lit centre cannot wreck a colour.
    return [
      s < 0.15 ? fallback[0] : h, // a grey centre carries no usable hue
      s * 0.75 + fallback[1] * 0.25,
      v * 0.75 + fallback[2] * 0.25,
    ] as [number, number, number];
  });
}

/* Nine samples of one face, centre included at index 4. */
export function assignFaceColors(
  samples: RGB[],
  faceIndex: number,
  references = DEFAULT_REFERENCES
): Color[] {
  // At most nine of any colour can appear, but on a single face only the centre
  // is certain, so the quota stays loose and mainly stops a sweep to one colour.
  const result = assignUnderQuota(samples, references, [9, 9, 9, 9, 9, 9]);
  result[4] = faceIndex as Color; // centre is fixed by the face it belongs to
  return result;
}

/*
 * Final pass over all 54 samples at once, in face order U L F R B D. This is
 * the one that matters: with the whole cube in hand the exact nine-per-colour
 * quota applies, which is what reliably separates red from orange.
 */
export function assignCubeColors(samples: RGB[]): Color[] {
  if (samples.length !== 54) throw new Error('assignCubeColors expects 54 samples');

  const centres: (RGB | null)[] = [];
  for (let face = 0; face < 6; face++) centres[face] = samples[face * 9 + 4];
  const references = buildReferences(centres);

  const result = assignUnderQuota(samples, references, [9, 9, 9, 9, 9, 9]);
  for (let face = 0; face < 6; face++) result[face * 9 + 4] = face as Color;
  return result;
}

/*
 * Average the pixels in a box, discarding outliers so a glare spot, a sticker
 * edge or the black gap between stickers does not drag the mean.
 *
 * The box is clamped to the canvas: getImageData throws on a negative origin,
 * and the caller's cell centre can sit within half a box of the edge.
 */
export function sampleRegionRGB(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): RGB {
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;

  const x0 = Math.max(0, Math.min(canvasW - 1, Math.round(x - w / 2)));
  const y0 = Math.max(0, Math.min(canvasH - 1, Math.round(y - h / 2)));
  const boxW = Math.max(1, Math.min(w, canvasW - x0));
  const boxH = Math.max(1, Math.min(h, canvasH - y0));

  const data = ctx.getImageData(x0, y0, boxW, boxH).data;
  const count = data.length / 4;
  if (count === 0) return [0, 0, 0];

  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < data.length; i += 4) { mr += data[i]; mg += data[i + 1]; mb += data[i + 2]; }
  mr /= count; mg /= count; mb /= count;

  let vr = 0, vg = 0, vb = 0;
  for (let i = 0; i < data.length; i += 4) {
    vr += (data[i] - mr) ** 2;
    vg += (data[i + 1] - mg) ** 2;
    vb += (data[i + 2] - mb) ** 2;
  }
  const sr = Math.sqrt(vr / count), sg = Math.sqrt(vg / count), sb = Math.sqrt(vb / count);

  let sumR = 0, sumG = 0, sumB = 0, kept = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - mr) <= sr + 1 &&
      Math.abs(data[i + 1] - mg) <= sg + 1 &&
      Math.abs(data[i + 2] - mb) <= sb + 1
    ) {
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; kept++;
    }
  }

  if (kept === 0) return [Math.round(mr), Math.round(mg), Math.round(mb)];
  return [Math.round(sumR / kept), Math.round(sumG / kept), Math.round(sumB / kept)];
}
