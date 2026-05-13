import type { Color } from './cubeState';

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

// Reference centroids in HSV for distance fallback
const COLOR_CENTROIDS: [number, number, number, Color][] = [
  [0, 0, 0.95, 0],   // White  — hue irrelevant
  [55, 0.90, 0.90, 5], // Yellow
  [20, 0.90, 0.80, 4], // Orange
  [5,  0.90, 0.80, 2], // Red
  [130, 0.70, 0.50, 1], // Green
  [225, 0.80, 0.60, 3], // Blue
];

function nearestColor(h: number, s: number, v: number): Color {
  let best: Color = 0;
  let bestDist = Infinity;
  for (const [ch, cs, cv, color] of COLOR_CENTROIDS) {
    const dh = Math.min(Math.abs(h - ch), 360 - Math.abs(h - ch)) / 180;
    const ds = s - cs;
    const dv = v - cv;
    const dist = dh * dh * 0.5 + ds * ds + dv * dv;
    if (dist < bestDist) { bestDist = dist; best = color; }
  }
  return best;
}

export function classifyColor(r: number, g: number, b: number): Color {
  const [h, s, v] = rgbToHsv(r, g, b);

  if (s < 0.20 && v > 0.75) return 0;                            // White
  if (h >= 35 && h <= 75 && s > 0.45 && v > 0.55) return 5;     // Yellow
  if (h >= 10 && h <= 35 && s > 0.55 && v > 0.45) return 4;     // Orange
  if ((h <= 10 || h >= 340) && s > 0.50) return 2;               // Red
  if (h >= 85 && h <= 175 && s > 0.30 && v > 0.30) return 1;    // Green
  if (h >= 195 && h <= 260 && s > 0.35 && v > 0.30) return 3;   // Blue

  return nearestColor(h, s, v);
}

export function sampleRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): Color {
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const data = ctx.getImageData(x - halfW, y - halfH, w, h).data;

  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Compute per-channel means
  const means = [0, 1, 2].map(
    (c) => pixels.reduce((s, p) => s + p[c], 0) / pixels.length
  );

  // Compute per-channel std-devs
  const stds = [0, 1, 2].map((c) => {
    const variance = pixels.reduce((s, p) => s + (p[c] - means[c]) ** 2, 0) / pixels.length;
    return Math.sqrt(variance);
  });

  // Average only pixels within ±1 std-dev on all channels
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (const [pr, pg, pb] of pixels) {
    if (
      Math.abs(pr - means[0]) <= stds[0] + 1 &&
      Math.abs(pg - means[1]) <= stds[1] + 1 &&
      Math.abs(pb - means[2]) <= stds[2] + 1
    ) {
      sumR += pr; sumG += pg; sumB += pb; count++;
    }
  }

  if (count === 0) return classifyColor(means[0], means[1], means[2]);
  return classifyColor(Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count));
}
