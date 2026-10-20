# Camera & Upload Scan — Implementation Plan

Improves the two photo-based input modes, `WebcamScanner` (live camera) and `ImageUpload` (photos), plus the shared colour pipeline behind them. Phase 1 fixes correctness bugs and gives every failed scan a way forward. Phases 2 and 3 are UX work on top.

Branch: `feature/camera-scan`, cut from `cpp`. The scanner, classifier and cube-state files are identical on `cpp` and `js`, and these bugs exist in every variant, so per `BRANCHES.md` the work starts on the lowest branch and merges up: feature → `cpp` → `js` → `ui-threejs`. On `ui-threejs` the scanner files differ only in theme class names (`text-fg`, `dark:` variants), so expect small conflicts there, and restyle any new boxes with that branch's tokens. Use one commit per tracker row.

## Progress Tracker

| #   | Item | File(s) | Est. | Status |
|-----|------|---------|------|--------|
| 1.1 | Shared scan module + rotated-face auto-fix | `web/src/lib/scan.ts` (new) | 1.5h | ✅ Done |
| 1.2 | Self-check script | `web/scripts/scan-selfcheck.ts` (new) | 0.5h | ✅ Done |
| 1.3 | Shared colour-correction grid | `web/src/components/FaceColorGrid.tsx` (new) | 0.25h | ✅ Done |
| 1.4 | Webcam: stale overrides, re-scan flow, editor hand-off | `WebcamScanner.tsx` | 1h | ✅ Done |
| 1.5 | Upload: override bug, downscale, live re-extract, URL leak, hand-off | `ImageUpload.tsx` | 1.5h | ✅ Done |
| 1.6 | Page: accept scans with notes, show them | `app/solve/page.tsx` | 0.5h | ✅ Done |
| 1.7 | Delete unused `sampleRegion` | `lib/colorClassifier.ts` | 5m | ✅ Done |
| 2.1 | Camera errors: HTTPS check, specific messages, Try again | `WebcamScanner.tsx` | 0.5h | ✅ Done |
| 2.2 | Square frame on phones, bigger grid | `WebcamScanner.tsx` | 10m | ✅ Done |
| 2.3 | Required orientation drawn on the grid | `WebcamScanner.tsx`, `ImageUpload.tsx` | 0.5h | ✅ Done |
| 2.4 | Live colour preview + wrong-face warning | `WebcamScanner.tsx` | 1.5h | ✅ Done |
| 2.5 | Auto-capture when steady (toggle) | `WebcamScanner.tsx` | 1h | ✅ Done |
| 3.1 | "Take photo" button + HEIC message | `ImageUpload.tsx` | 0.5h | ⬜ Todo |
| 3.2 | Pick several photos, match faces by centre colour | `ImageUpload.tsx`, `scan.ts`, `colorClassifier.ts` | 1.5h | ⬜ Todo |
| 3.3 | Auto-place the grid on the cube (gated on fixtures) | `web/src/lib/locateGrid.ts` (new) | 3h + photos | ⬜ Todo |
| 4   | Docs: CLAUDE.md "Scan input" | `CLAUDE.md` | 10m | ⬜ Todo |
|     | **Total** | | **~14h** | |

Phase 1 ships on its own. Phase 2 and 3 items are independent of each other, but each assumes Phase 1 is done.

---

## Problems found in the current code

| # | Where | Problem | Fixed in |
|---|-------|---------|----------|
| B1 | [ImageUpload.tsx:245-250](../web/src/components/ImageUpload.tsx#L245-L250) | A "manual correction" is detected by comparing each sticker with `assignFaceColors(samples, fi)` run **without** the centre-calibrated references. Every sticker the calibrated pass classified differently counts as a user edit and overrides the 54-sticker quota pass, which is the pass that separates red from orange. | 1.5 |
| B2 | [WebcamScanner.tsx:250](../web/src/components/WebcamScanner.tsx#L250) | `overrides` is never cleared. If you correct a cell, then Re-scan or go back to the face, the old correction is applied to the new capture. | 1.4 |
| B3 | [WebcamScanner.tsx:259](../web/src/components/WebcamScanner.tsx#L259) | After you re-scan an earlier face, "Use This Face" steps through faces you already scanned. Finish is only offered on face 6. | 1.4 |
| B4 | [ImageUpload.tsx:68](../web/src/components/ImageUpload.tsx#L68) | The photo is drawn to a canvas at full resolution. iOS Safari caps canvas area at about 16.7 MP, and a 24/48 MP photo draws blank, so every sample reads black. The full photo is also redrawn on every grid move. | 1.5 |
| B5 | [ImageUpload.tsx:367](../web/src/components/ImageUpload.tsx#L367) | Colours are only re-read on `onPointerUp`, so moving the slider with the keyboard never updates them. | 1.5 |
| B6 | [ImageUpload.tsx:55-62](../web/src/components/ImageUpload.tsx#L55-L62) | The unmount cleanup holds the `faces` array from the first render (all `null`), so object URLs are never revoked. | 1.5 |
| B7 | both | A cube that fails the check is a dead end: the webcam only offers "Re-scan all faces", and upload only lists the errors. | 1.4, 1.5, 1.6 |
| B8 | [WebcamScanner.tsx:95](../web/src/components/WebcamScanner.tsx#L95) | Over plain `http://` (e.g. testing on a phone via `http://192.168.x.x:3000`), `navigator.mediaDevices` is undefined, so the user sees "browser does not support camera access", which is wrong. Every `getUserMedia` error also collapses into one generic message. | 2.1 |

---

## Measured: rotated-face auto-fix (basis for 1.1)

The code comments already name a face captured 90° off as the most common reason a scan fails. A quarter-turned face keeps the colour counts, but it produces impossible pieces or broken parity, so `validate()` rejects it. That makes it searchable: try quarter-turns of the faces and keep the first combination that validates.

I ran this against the real `validate()` in `cubeState.ts`, using random 25-move scrambles:

| Test | Result |
|------|--------|
| One face rotated by 90/180/270° → original recovered | **2995 / 3000** (99.8%) |
| Two faces rotated → original recovered | **994 / 1000** (99.4%) |
| Cube with a real colour mistake (one red/orange pair swapped, no rotation) gets "fixed" into a *different* valid cube | 6-8 / 1000 (~0.7%), the same whether the search allows 1, 2 or 6 rotated faces |
| Search cost, capped at 2 rotated faces (154 combinations) | 0.5 ms with nothing found, ≤1.5 ms with a hit |

Two decisions follow from these numbers:

- Cap the search at **two rotated faces**. Allowing more recovers no extra cases.
- A fix is **never silent**. The scan lands in the manual editor with a note naming the corrected face, so the user can compare it against the real cube before solving. The ~0.7% false-fix case is visible there, not hidden.

---

## Phase 1: correctness

### 1.1 `web/src/lib/scan.ts` (new)

This replaces the two copies of `FACE_ORIENTATION` and the two "finish" code paths. Imports are relative, like `colorClassifier.ts`, so the self-check can run outside Next.

```ts
import { FACE_NAMES, validate } from './cubeState';
import type { CubeState, Color } from './cubeState';
import { assignCubeColors } from './colorClassifier';
import type { RGB } from './colorClassifier';

/*
 * The 54-character state is not just six faces of colours — each face has a
 * fixed orientation inside it. For each face, the neighbouring face that must
 * sit along the top edge and the left edge of the view. Derived from the
 * sticker adjacencies in cubeState.ts.
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
```

Notes:
- `rotateFaceCW` stays private. Callers only need `fixRotatedFaces` and `finishScan`.
- Overrides are applied **before** the rotation search, because they are indexed in the orientation the user captured.

### 1.2 `web/scripts/scan-selfcheck.ts` (new)

There's no test runner in `web/`, and this doesn't add one. It's an assert script, run with `npx --yes tsx` (fetched on first use, not added to `package.json`). `generateScramble` uses `Math.random`, so the script seeds it to keep results repeatable: the 0.2% single-face miss rate would otherwise make it flaky.

```ts
// Run from web/: npx --yes tsx scripts/scan-selfcheck.ts
import assert from 'node:assert/strict';
import { generateScramble, COLOR_HEX } from '../src/lib/cubeState';
import type { CubeState, Color } from '../src/lib/cubeState';
import type { RGB } from '../src/lib/colorClassifier';
import { finishScan, dropFace } from '../src/lib/scan';

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

console.log('scan self-check passed');
```

- Already proven while writing this plan: the `scan.ts` code in 1.1 and this script were run as written (under Node 22 type stripping) and passed. They also failed, as they should, against two deliberately broken versions: one with the rotation search removed, one ignoring overrides.
- 3.2 adds a case for `matchPhotosToFaces` here.

### 1.3 `web/src/components/FaceColorGrid.tsx` (new)

The 3×3 tap-to-correct grid currently appears twice ([WebcamScanner.tsx:345-361](../web/src/components/WebcamScanner.tsx#L345-L361), [ImageUpload.tsx:392-408](../web/src/components/ImageUpload.tsx#L392-L408)). Move it into one component, keeping the existing markup and aria labels:

```tsx
'use client';

import clsx from 'clsx';
import { Color, COLOR_HEX, COLOR_NAMES } from '@/lib/cubeState';

interface Props {
  colors: Color[];
  onCycle: (cell: number) => void;
}

export default function FaceColorGrid({ colors, onCycle }: Props) {
  return (
    <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
      {colors.map((color, i) => (
        <button
          key={i}
          onClick={() => onCycle(i)}
          disabled={i === 4}
          aria-label={`${COLOR_NAMES[color]}${i === 4 ? ' (centre, fixed)' : ''}`}
          className={clsx(
            'w-10 h-10 rounded border-2 transition-transform',
            i === 4 ? 'border-slate-400 cursor-default' : 'border-slate-600 hover:border-white hover:scale-110 cursor-pointer'
          )}
          style={{ backgroundColor: COLOR_HEX[color] }}
        />
      ))}
    </div>
  );
}
```

### 1.4 `WebcamScanner.tsx`

**Props:** `onComplete: (state: CubeState, notes: string[]) => void`.

**Imports:** drop `assignCubeColors` and `validate`. Add `FACE_ORIENTATION, Overrides, ScanResult, dropFace, finishScan` from `@/lib/scan`, and `FaceColorGrid`. Delete the local `FACE_ORIENTATION` (lines 13-30). Its comment moves to `scan.ts`.

**State:** replace `validationErrors` with `const [failed, setFailed] = useState<ScanResult | null>(null);` and type `overrides` as `Overrides`.

**B2.** At the end of `handleCapture`, just before `setPreview`:
```ts
setOverrides((o) => dropFace(o, face));
```
The capture replaces the samples, so earlier corrections for this face no longer apply.

**B3, B7.** Rewrite `handleUseFace` to:
```ts
function handleUseFace() {
  if (!preview) return;
  const next = [...scanned];
  next[faceIdx] = preview;
  setScanned(next);
  setPreview(null);

  const missing = next.findIndex((f) => !f);
  if (missing !== -1) { setFaceIdx(missing); return; }

  const result = finishScan(next.flatMap((f) => f!.samples), overrides);
  if (result.errors.length === 0) onComplete(result.state, result.notes);
  else setFailed(result);
}
```
Button label: `const isLastFace = scanned.every((f, i) => i === faceIdx || f);` and then `{isLastFace ? 'Finish' : 'Use This Face →'}`.

**Dot navigation:** any dot can be clicked. A scanned face reopens its saved capture for review instead of forcing a re-capture:
```tsx
onClick={() => { setFaceIdx(i); setPreview(scanned[i]); }}
```
This works because `preview.colors` already carries the manual corrections (`cycleCell` writes into it before "Use" stores it).

**Preview grid:** swap the inline grid for `<FaceColorGrid colors={preview.colors} onCycle={cycleCell} />`. The `cellIdx === 4` guard stays in `cycleCell`.

**Failure box:** `failed.errors` is mapped like `validationErrors` was. Two actions:
```tsx
<button onClick={() => onComplete(failed.state, [])}>Fix colours in the editor</button>
<button onClick={restart}>Re-scan all faces</button>
```
In `restart()`, replace `setValidationErrors([])` with `setFailed(null)`.

### 1.5 `ImageUpload.tsx`

**Props:** `onComplete: (state: CubeState, notes: string[]) => void`.

**Imports:** drop `assignFaceColors`/`assignCubeColors`/`validate` as their only callers go away. Import `assignFaceColors` again only for `extract` (it still shows per-face colours). Add scan + `FaceColorGrid` imports. Delete the local `FACE_ORIENTATION`.

**B4: downscale once, cache the canvas.** Remove the shared hidden `canvasRef` and its `<canvas>`. Change `imageCache` to `Map<number, CanvasRenderingContext2D>`:
```ts
// iOS Safari caps a canvas at ~16.7 MP and draws a 24/48 MP photo blank above it.
const MAX_SIDE = 1600;

function toCanvas(img: HTMLImageElement): CanvasRenderingContext2D {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx;
}
```
- `FaceData.naturalW/naturalH` now hold the **canvas** size. The SVG `viewBox` uses them, and the `<img>` is drawn at the same aspect ratio, so the overlay still lines up. Rename them to `w`/`h` in the same commit to avoid misleading names.
- `extract(ctx, gridX, gridY, gridSize, faceIdx, allFaces)` takes the cached context and no longer calls `drawImage`.
- In `img.onload`: `const ctx = toCanvas(img); imageCache.current.set(targetFace, ctx);`, size the default grid from `ctx.canvas.width/height`, then `setOverrides((o) => dropFace(o, targetFace))`.

**B5: one grid updater, re-reads colours on every change.** Sampling is now 9 small `getImageData` calls with no redraw, so it's cheap enough per pointer move. Replace `resizeGrid`, `reExtract` and the re-extract in `onPointerUp` with:
```ts
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function updateGrid(face: number, patch: { gridX?: number; gridY?: number; gridSize?: number }) {
  const ctx = imageCache.current.get(face);
  if (!ctx) return;
  setFaces((prev) => {
    const f = prev[face];
    if (!f) return prev;
    const gridSize = clamp(patch.gridSize ?? f.gridSize, 40, Math.min(f.w, f.h));
    const gridX = clamp(patch.gridX ?? f.gridX, 0, f.w - gridSize);
    const gridY = clamp(patch.gridY ?? f.gridY, 0, f.h - gridSize);
    const next = [...prev];
    next[face] = { ...f, gridX, gridY, gridSize, ...extract(ctx, gridX, gridY, gridSize, face, prev) };
    return next;
  });
  setOverrides((o) => dropFace(o, face));
}
```
- `onPointerMove`: `updateGrid(activeFace, { gridX: p.x - dragOffset.current.x, gridY: p.y - dragOffset.current.y })`.
- `onPointerUp`: only `setDragging(false)`.
- Slider: `onChange={(e) => updateGrid(activeFace, { gridSize: Number(e.target.value) })}`, with `onPointerUp` removed.

**B1: explicit overrides.** Add `const [overrides, setOverrides] = useState<Overrides>({});`. `cycleCell` updates `colors` as today and also records the edit:
```ts
setOverrides((o) => ({ ...o, [activeFace * 9 + cellIdx]: colors[cellIdx] }));
```
(Compute `colors` outside the `setFaces` updater so both setters see the same value.)

`handleFinish` becomes:
```ts
function handleFinish() {
  if (faces.some((f) => !f)) return;
  const result = finishScan(faces.flatMap((f) => f!.samples), overrides);
  if (result.errors.length === 0) onComplete(result.state, result.notes);
  else setFailed(result);
}
```
The failure box gets the same two buttons as the webcam: "Fix colours in the editor" (`onComplete(failed.state, [])`) and a dismiss. Re-uploading any face clears `failed`.

**B6: URL leak.** Read the latest `faces` from a ref:
```ts
const facesRef = useRef(faces);
facesRef.current = faces;
useEffect(() => () => { facesRef.current.forEach((f) => { if (f) URL.revokeObjectURL(f.imgUrl); }); }, []);
```
(`imageCache` is garbage-collected with the component, so the `cache.clear()` goes.)

**Preview grid:** `<FaceColorGrid colors={currentFace.colors} onCycle={cycleCell} />`.

### 1.6 `app/solve/page.tsx`

```ts
const [scanNotes, setScanNotes] = useState<string[]>([]);

function handleScanned(state: CubeState, notes: string[]) {
  handleStateChange(state);                    // clears validationErrors...
  setValidationErrors(validate(state).errors); // ...so set them after; empty when valid
  setScanNotes(notes);
  setInputTab('manual');
}
```
- Both scanners get `onComplete={handleScanned}`.
- Call `setScanNotes([])` in `handleShuffle` and at the top of `handleSolve`. It isn't in `handleStateChange`, so painting a cell doesn't hide a note the user still needs.
- Render the notes on the manual tab directly above the "Invalid Cube State" box, in the same layout with amber colours (`bg-amber-500/10 border-amber-500/20 text-amber-300`), titled "Scan auto-corrected".
- An invalid scan lands in the manual picker with the existing red error box, which is the "fix in editor" path. Nothing else is needed: Solve re-validates.

### 1.7 `lib/colorClassifier.ts`

Delete `sampleRegion` (lines 224-234). It has no callers. `classifyColor` stays, because 2.4 uses it.

### Phase 1 done when
- `npx --yes tsx scripts/scan-selfcheck.ts`, `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass in `web/`.
- In the browser, a scan with one face uploaded rotated lands in the editor, solvable, with a note naming that face.
- A scan with a wrong colour lands in the editor with the red error box, and can be fixed and solved there.

---

## Phase 2: webcam UX

### 2.1 Camera errors (B8)

In the camera effect:
- Before the `mediaDevices` check, add:
  ```ts
  if (!window.isSecureContext) {
    setCameraError('The camera only works over HTTPS or on localhost. Open the https:// address, or use Upload.');
    return;
  }
  ```
- Keep the last error from the loop. Break on `NotAllowedError` so a refused permission doesn't prompt a second time.
  ```ts
  } catch (err) {
    lastError = err;
    if ((err as DOMException).name === 'NotAllowedError') break;
  }
  ...
  if (!cancelled) setCameraError(cameraMessage(lastError));
  ```
- Add a module-level function:
  ```ts
  function cameraMessage(err: unknown): string {
    switch ((err as DOMException | undefined)?.name) {
      case 'NotAllowedError': return 'Camera access was blocked. Allow it in your browser\'s site settings, then try again.';
      case 'NotFoundError':
      case 'OverconstrainedError': return 'No camera was found on this device.';
      case 'NotReadableError': return 'The camera is in use by another app. Close it, then try again.';
      default: return 'Could not start the camera.';
    }
  }
  ```
- Retry: `const [attempt, setAttempt] = useState(0);` and change the effect deps to `[attempt]`. The error view gets `Try again` → `{ setCameraError(null); setAttempt((a) => a + 1); }` next to "Back to Manual". The `<video>` is back in the DOM before the effect re-runs, because the effect runs after commit.

### 2.2 Frame shape

- `aspect-video` → `aspect-square sm:aspect-video` on the video box ([WebcamScanner.tsx:301](../web/src/components/WebcamScanner.tsx#L301)). Phones are held upright, and the 16:9 box crops a 720×1280 stream heavily.
- `GRID_FRACTION` 0.62 → 0.7. `gridInDisplaySpace` already uses `min(boxW, boxH)`, so nothing else changes.

### 2.3 Orientation on the grid

Draw the required top and left neighbour colours as thick bars **inside** the grid's top and left edges. Inside, because an upload grid can touch the photo edge. A bar is 12% of a cell, and the sampled box covers 35-65% of the cell, so the bars never touch it. The text hint stays for screen readers.

- **Webcam**, in `drawOverlay` after the grid lines:
  ```ts
  const { top, left } = FACE_ORIENTATION[latest.current.face];
  const bar = Math.max(4, cell * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.fillStyle = COLOR_HEX[top];
  ctx.fillRect(gridX, gridY, gridSize, bar);  ctx.strokeRect(gridX, gridY, gridSize, bar);
  ctx.fillStyle = COLOR_HEX[left];
  ctx.fillRect(gridX, gridY, bar, gridSize);  ctx.strokeRect(gridX, gridY, bar, gridSize);
  ```
  `drawOverlay` is a `useCallback([])` animation loop and can't see the current state. Add one "latest" ref that later items reuse:
  ```ts
  const latest = useRef({ face, scanned, preview });
  latest.current = { face, scanned, preview };
  ```
- **Upload**, as two more `<rect>`s in the SVG, using the same proportions and `COLOR_HEX[orientation.top/left]`, with `stroke="rgba(0,0,0,0.6)"`.

White bars (the top edge of L/F/R/B) still read clearly against the thin white grid border because of their thickness and dark outline.

### 2.4 Live preview and wrong-face warning

Split the sampling part of `handleCapture` (lines 204-234: cover transform, `drawImage`, nine probes) into `function sampleGrid(): RGB[] | null`. `handleCapture` then becomes `const samples = sampleGrid(); if (!samples) return; …`.

In `drawOverlay`, sample about every 150 ms while no preview is open:
```ts
const LIVE_INTERVAL_MS = 150;
const liveRef = useRef<{ at: number; colors: Color[] | null }>({ at: 0, colors: null });
const [wrongFace, setWrongFace] = useState<Color | null>(null);

// inside drawOverlay, before drawing:
const now = performance.now();
if (!latest.current.preview && now - liveRef.current.at > LIVE_INTERVAL_MS) {
  liveRef.current.at = now;
  const samples = sampleGrid();
  if (samples) {
    const { face, scanned } = latest.current;
    const seen = scanned.map((f) => f?.samples[4] ?? null);
    // Centres already captured are references taken in this very light, so a
    // match against one of them is trustworthy. Red and orange are only told
    // apart once both have been seen.
    const looks = classifyColor(...samples[4], buildReferences(seen));
    const redOrange = (looks === 2 && face === 4) || (looks === 4 && face === 2);
    const wrong = looks !== face && !(redOrange && !scanned[looks]) ? looks : null;
    setWrongFace((w) => (w === wrong ? w : wrong));

    seen[face] = samples[4];
    liveRef.current.colors = assignFaceColors(samples, face, buildReferences(seen));
  }
}
```
- **Drawing:** when `liveRef.current.colors` is set, fill each sample square with `COLOR_HEX[colors[i]]` at 0.85 alpha with a dark outline, instead of today's white at 0.22 alpha. Clear `liveRef.current.colors` while a preview is open.
- **UI:** under the face prompt, show `{wrongFace !== null && !preview && <p className="text-xs text-amber-400">That looks like the {COLOR_NAMES[wrongFace]} face. Show the {COLOR_NAMES[face]} centre.</p>}`. This is a hint only. Capture is not blocked.
- **Cost:** a full-frame `drawImage` plus nine small reads about 7 times a second. If a low-end phone stutters, raise the interval. Don't sample a smaller frame, because that changes the probe maths.

### 2.5 Auto-capture (optional, only after 2.4 works on a real phone)

This captures once the live colours have held still for 0.8 s. The preview and the "Use This Face" confirm stay, so a false trigger costs one Re-scan tap. Today you need two hands for the cube and one for the button.

```ts
const STEADY_MS = 800;
const [autoCapture, setAutoCapture] = useState(true);
const steady = useRef({ sig: '', since: 0, captured: '' });
const captureRef = useRef(handleCapture);
captureRef.current = handleCapture; // the animation loop must call the current closure

// in the live block, after liveRef.current.colors is set:
const sig = liveRef.current.colors.join('');
if (sig !== steady.current.sig) steady.current = { ...steady.current, sig, since: now };
else if (latest.current.autoCapture && wrong === null && sig !== steady.current.captured
         && now - steady.current.since > STEADY_MS) {
  steady.current.captured = sig;
  captureRef.current();
}
```
- Add `autoCapture` to the `latest` ref.
- `captured` stops a re-trigger on the exact arrangement just captured, so after Re-scan the user has to move the cube. Moving to the next face changes the centre, so it re-arms on its own.
- **UI:** an "Auto-capture" checkbox next to the Capture button, plus a progress ring around the grid while the colours are holding still. The ring is optional, so skip it if time is short.
- **Known limit:** a plain wall in the grid reads as nine steady whites. On the white face that can trigger, and the confirm step catches it.

### Phase 2 done when
- Over `http://<LAN-IP>:3000` on a phone, the user gets the HTTPS message, not "not supported".
- Denying permission shows the blocked message, and Try again works after allowing it.
- The grid cells show live colours. Showing an already-scanned face shows the amber hint.
- With auto-capture on, all six faces can be scanned with one confirm tap each.

---

## Phase 3: upload UX

### 3.1 Take photo + HEIC

- Replace the single upload label with two:
  - **Take photo**: `<input type="file" accept="image/*" capture="environment">`. It opens the rear camera on phones and is hidden where a mouse is used (`[@media(pointer:fine)]:hidden`), since desktop ignores `capture`.
  - **Choose photos**: `<input type="file" accept="image/*" multiple>` (see 3.2).
- HEIC: Windows/desktop Chrome often reports an iPhone `.heic` as type `''`, so the current "not an image" check rejects it with the wrong message. Check for it **before** the type check:
  ```ts
  const heic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
  ```
  If `heic` is true and decoding fails (`img.onerror`), show: "This browser can't open HEIC photos. Use Safari, or export the photo as JPEG." Safari decodes HEIC itself, so don't reject it up front.

### 3.2 Several photos at once, matched by centre colour

People usually centre the cube in a photo, so the default grid's middle sample (the image centre) is usually the centre sticker. Assigning photos to faces by best overall match, instead of one at a time, applies the same idea as the quota: if two centres both look orange-ish, the redder one gets red.

- `colorClassifier.ts`, new export:
  ```ts
  /* Cost of `sample` against each default colour; for matching photos to faces before any calibration exists. */
  export function defaultCosts([r, g, b]: RGB): number[] {
    const hsv = rgbToHsv(r, g, b);
    return DEFAULT_REFERENCES.map((ref) => colorDistance(hsv, ref));
  }
  ```
- `scan.ts`, new export. Brute force over at most 6! = 720 orderings:
  ```ts
  /* Assign photos (by their centre sample) to the given faces, minimising total colour cost. */
  export function matchPhotosToFaces(centres: RGB[], faces: number[]): number[] {
    const costs = centres.map(defaultCosts);
    let best: number[] = [], bestCost = Infinity;
    const walk = (i: number, used: number[], cost: number) => {
      if (cost >= bestCost) return;
      if (i === centres.length) { best = used; bestCost = cost; return; }
      for (const f of faces) if (!used.includes(f)) walk(i + 1, [...used, f], cost + costs[i][f]);
    };
    walk(0, [], 0);
    return best;
  }
  ```
- `ImageUpload.tsx`: `handleFileChange` → `handleFiles(files: File[])`.
  - One file: today's behaviour (goes to `activeFace`).
  - Several: target faces are all six if 6+ files were picked, otherwise the empty faces. More files than targets is an error: "Only N faces left to fill".
  - Decode with `await img.decode()` (wrap `onerror` handling into a promise), call `toCanvas` and `extract` with the default grid, then `matchPhotosToFaces(samples.map(s => s[4]), targets)` and store each result.
  - Switch to the first assigned face. Show a one-line hint: "Photos were matched to faces by centre colour. Check each tab."
- Self-check addition: six centres taken from `COLOR_HEX` in shuffled order map back to their faces. Two centres, a pure red and a warm red-orange, against faces {2, 4} assign red → 2.

### 3.3 Auto-place the grid (experimental, gated)

`web/src/lib/locateGrid.ts`: `locateGrid(ctx): { gridX, gridY, gridSize } | null`, used as the initial grid in place of "60% centred" only when it returns non-null.

Algorithm (all on a copy downscaled to ~240 px on the long side, with coordinates scaled back up):
1. Build summed-area tables for R, G, B, R², G², B² and luminance, so any box's mean and variance cost O(1).
2. Try sizes from 30% to 95% of the short side in 3% steps, and positions in steps of `size / 12`. That's about 100k box queries in total.
3. Score each candidate on its 9 sample boxes (the centre 40% of each cell) and its 4 inner grid lines (strips 8% of a cell wide):
   `score = mean(sample std-dev) − α·(mean sample luminance − mean grid-line luminance) − β·mean sample saturation`.
   Stickers are uniform inside, brighter than the black plastic between them, and mostly saturated.
4. Return the best candidate only if its line-contrast term is clearly positive. Otherwise return `null` and keep the centred default.

Gate: collect about 12 real photos first (different lighting, phone and laptop, with one stickerless cube), stored in `web/scripts/fixtures/upload/` with the true grid as JSON beside each. Tune α/β on them. Make it the default only if it lands within IoU ≥ 0.8 of the true grid on at least 80% of photos. If it doesn't, drop 3.3: dragging the grid already works.

Known limit: stickerless cubes have no dark grid lines, so they get `null` and the centred default.

### Phase 3 done when
- On a phone, "Take photo" opens the rear camera.
- Picking all six photos in random order fills all six faces correctly.
- A HEIC file in desktop Chrome shows the HEIC message.
- 3.3 meets its gate, or is dropped with the measured results noted here.

---

## 4. Docs

In `CLAUDE.md` → "Scan input", add:
- `lib/scan.ts` owns `FACE_ORIENTATION` and `finishScan`. Both scanners finish through it.
- Rotated-face auto-fix: the search is capped at 2 faces, results are always shown to the user, and the ~0.7% false-fix figure.
- Photos are downscaled to 1600 px because of the iOS canvas cap.
- Self-check command: `npx --yes tsx scripts/scan-selfcheck.ts`.

---

## Verification

| Check | How |
|-------|-----|
| Logic | `cd web && npx --yes tsx scripts/scan-selfcheck.ts` |
| Types / lint / build | `npx tsc --noEmit`, `npm run lint`, `npm run build` |
| Upload end-to-end | Playwright: render 6 synthetic face images in the page from a known scramble (canvas, with a warm tint and noise, one face drawn rotated), `setInputFiles`, Finish, then read the 54 manual-picker cell colours and compare against the scramble. Expect one "corrected" note. |
| Webcam end-to-end | Playwright `addInitScript`: replace `navigator.mediaDevices.getUserMedia` with a `canvas.captureStream()` that draws the face the scanner is asking for. Drive Capture/Use for all six faces, including one drawn rotated. This needs no browser flags and no video file. |
| Real devices | iPhone Safari and Android Chrome against an HTTPS Vercel preview. Check the rear camera, permission deny then allow plus Try again, the portrait frame, a 48 MP photo from the gallery, a HEIC photo, and a full six-face scan under warm indoor light. Then desktop Chrome with a laptop webcam. |

## Risks

- **Auto-fix can produce a wrong but valid cube** (~0.7% of scans that also contain a colour mistake). Mitigation: it's never silent. The scan always lands in the editor with a note naming the face.
- **Live sampling cost on low-end phones** (2.4). Mitigation: a 150 ms interval, raised if needed. Sampling stops while a preview is open.
- **Auto-capture false triggers** (2.5). Mitigation: the confirm step stays, it can be switched off, and it won't re-trigger on an arrangement just captured.
- **Grid auto-placement may not beat the centred default** (3.3). Mitigation: gated on real fixtures, and dropped if it fails.

## Out of scope

- OpenCV or ML cube detection: too heavy a dependency for this.
- Torch and white-balance lock: browser support is patchy, and centre-sticker references already adjust for lighting.
- A camera picker.
- Mirroring the front camera: the unmirrored view is what keeps "left edge" correct.
- Highlighting low-confidence stickers in the editor: a possible follow-up once 1.6 is in use.
