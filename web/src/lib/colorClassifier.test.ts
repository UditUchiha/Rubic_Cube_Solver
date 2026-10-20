import { describe, it, expect } from 'vitest';
import { assignCubeColors, RGB } from './colorClassifier';
import { generateScramble } from './cubeState';

// Warm indoor light: whites go cream and red drifts toward orange, which is
// the case that broke per-sticker classification.
const WARM: RGB[] = [
  [255, 235, 200], // White
  [60, 170, 70],   // Green
  [215, 55, 25],   // Red
  [40, 80, 170],   // Blue
  [235, 115, 25],  // Orange
  [240, 215, 40],  // Yellow
];

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe('assignCubeColors', () => {
  it('recovers a scrambled cube under warm light with sensor noise', () => {
    const rand = seeded(42);
    for (let trial = 0; trial < 20; trial++) {
      const { state } = generateScramble(20);
      const samples = state.map((c) =>
        WARM[c].map((v) => Math.max(0, Math.min(255, v + Math.round((rand() - 0.5) * 16)))) as RGB
      );
      expect(assignCubeColors(samples)).toEqual(state);
    }
  });

  it('rejects the wrong number of samples', () => {
    expect(() => assignCubeColors([])).toThrow();
  });
});
