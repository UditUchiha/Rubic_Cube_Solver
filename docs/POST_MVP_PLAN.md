# Post-MVP Features Plan

Builds on the completed MVP (manual color picker + 3D cube display + solution player + backend). All 7 features below use existing utilities in `web/src/lib/cubeState.ts` and existing component interfaces.

## Progress Tracker

| # | Feature | File(s) | Est. | Status |
|---|---------|---------|------|--------|
| 1 | Color classifier | `web/src/lib/colorClassifier.ts` | 2h | ⬜ Todo |
| 2 | Parity validation | extend `web/src/lib/cubeState.ts` | 2h | ⬜ Todo |
| 3 | Webcam scanner | `web/src/components/WebcamScanner.tsx` | 6h | ⬜ Todo |
| 4 | Image upload | `web/src/components/ImageUpload.tsx` | 4h | ⬜ Todo |
| 5 | Animated face turns | extend `web/src/components/RubiksCube3D.tsx` | 4h | ⬜ Todo |
| 6 | Animation + player integration | extend `web/src/components/SolutionPlayer.tsx` | 3h | ⬜ Todo |
| 7 | Polish (mobile, loading, glassmorphism) | `web/src/app/solve/page.tsx` + globals | 3h | ⬜ Todo |
| | **Total** | | **~24h** | |

---

## Build Order

1. `colorClassifier.ts` — shared utility needed by webcam + image upload
2. Parity validation — extends `validate()`, no new files
3. Webcam scanner — most impactful new input method
4. Image upload — second input method, reuses colorClassifier
5. Animated face turns — visual upgrade to RubiksCube3D
6. Animation + player integration — wire SolutionPlayer to animated cube
7. Polish — mobile layout, loading states, glassmorphism

---

## Feature 1: colorClassifier.ts (~2h)

**File**: `web/src/lib/colorClassifier.ts`

Classifies a sampled RGB pixel into one of the 6 cube colors. Shared by WebcamScanner and ImageUpload.

### Exports

```typescript
export function rgbToHsv(r: number, g: number, b: number): [number, number, number]
// Returns [hue 0–360, saturation 0–1, value 0–1]

export function classifyColor(r: number, g: number, b: number): Color
// HSV threshold matching:
//   White:  s < 0.20, v > 0.75
//   Yellow: h in [35, 75],   s > 0.45, v > 0.55
//   Orange: h in [10, 35],   s > 0.55, v > 0.45
//   Red:    h in [0,10] or [340,360], s > 0.50
//   Green:  h in [85, 175],  s > 0.30, v > 0.30
//   Blue:   h in [195, 260], s > 0.35, v > 0.30
//   Fallback: nearest color by weighted HSV Euclidean distance

export function sampleRegion(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number
): Color
// Averages RGB over a w×h pixel block centered at (x, y)
// Ignores outlier pixels (outside ±1 std-dev of mean) for lighting robustness
```

### Testing
Create `web/src/lib/colorClassifier.test.ts`:
- `(255,255,255)` → WHITE
- `(255,50,50)` → RED
- `(50,200,50)` → GREEN
- `(50,50,255)` → BLUE
- `(255,165,0)` → ORANGE
- `(255,230,0)` → YELLOW

---

## Feature 2: Parity Validation (~2h)

**File**: `web/src/lib/cubeState.ts` — extend existing `validate()`

A cube with correct color counts can still be physically impossible to solve. The IDA* solver will run forever on such a state. These checks catch that in the frontend before the API call.

### Three rules to enforce

**Rule 1 — Corner orientation parity**
Each corner cubie has 3 stickers; one is W or Y (up/down axis color). Its orientation is:
- `0` = W/Y color is on U or D face
- `1` = rotated clockwise
- `2` = rotated counter-clockwise

Sum of all 8 corner orientations must be divisible by 3.

**Rule 2 — Edge orientation parity**
Each edge has 2 stickers. Sum of all 12 edge orientations (0 = normal, 1 = flipped) must be even.

**Rule 3 — Permutation parity**
The permutation of the 8 corner pieces and the permutation of the 12 edge pieces must have the same parity (both even or both odd). A single swap of two corners or two edges alone is illegal.

### Implementation

Port the corner-identification logic from `Model/RubiksCube.cpp::getCornerColorString()` to TypeScript, using `getFaceColors()` from `cubeState.ts`.

Add these three private helpers to `cubeState.ts` and call them at the end of `validate()`, only when the count and center checks already pass:

```typescript
function checkCornerOrientationParity(state: CubeState): boolean
function checkEdgeOrientationParity(state: CubeState): boolean
function checkPermutationParity(state: CubeState): boolean
```

Human-readable error messages to add to `errors[]`:
- `"Corner orientation parity error — a corner piece has been twisted"`
- `"Edge orientation parity error — an edge piece has been flipped"`
- `"Permutation parity error — two pieces have been swapped"`

---

## Feature 3: WebcamScanner (~6h)

**File**: `web/src/components/WebcamScanner.tsx`

```typescript
interface Props {
  onComplete: (state: CubeState) => void;
  onCancel: () => void;
}
```

### Scan flow (6 faces, one at a time)

Face order: UP → LEFT → FRONT → RIGHT → BACK → DOWN (matches 54-char string order).

**Step 1 — Camera setup**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
});
videoRef.current.srcObject = stream;
```
Handle `NotAllowedError` → show fallback: "Camera access denied. Use manual input instead."

**Step 2 — Grid overlay**
Render a `<canvas>` on top of the `<video>` showing a semi-transparent 3×3 grid. Grid size ≈ 40% of the shorter dimension, centered. Each cell shows where to align one sticker.

**Step 3 — Capture**
On "Capture" click:
```typescript
offscreenCtx.drawImage(videoRef.current, 0, 0);
const colors = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3), col = i % 3;
  return sampleRegion(offscreenCtx, gridX + col * cellSize, gridY + row * cellSize, 20, 20);
});
```

**Step 4 — Preview & correction**
Show detected colors as a 3×3 grid of colored squares overlaid on the video frame. Each non-center cell has a small tap-to-cycle button to manually correct misclassified colors. Center cell is locked to the expected face color.

**Step 5 — Confirm & advance**
"Use This Face" button saves the 9 colors and advances to the next face. Progress indicator: `● ● ○ ○ ○ ○`.

**Step 6 — Completion**
After all 6 faces: run `validate()`. If valid, call `onComplete(state)`. If errors, show them with the option to re-scan individual faces.

### UI layout
```
┌─────────────────────────────┐
│   [Video + 3×3 grid overlay]│
│                             │
│  Face 2 of 6 — LEFT         │
│  Point camera at GREEN center│
│                             │
│  [3×3 detected color preview]│
│  [Re-scan]  [Use This Face] │
│                             │
│  ● ● ○ ○ ○ ○               │
└─────────────────────────────┘
```

### Integration in solve/page.tsx
Add a "Camera" tab alongside the existing "Manual" tab. When WebcamScanner calls `onComplete(state)`, set `cubeState` and switch back to the manual view so the user can review/edit before clicking Solve.

---

## Feature 4: ImageUpload (~4h)

**File**: `web/src/components/ImageUpload.tsx`

```typescript
interface Props {
  onComplete: (state: CubeState) => void;
}
```

User uploads 6 photos (one per face). Simpler than webcam — no real-time stream needed.

### Flow

1. Show 6 upload zones labeled: "UP (White center)", "LEFT (Green center)", "FRONT (Red center)", "RIGHT (Blue center)", "BACK (Orange center)", "DOWN (Yellow center)".
2. Each zone: native `<input type="file" accept="image/*">`, shows a thumbnail once uploaded.
3. Each image is drawn to a hidden `<canvas>`.
4. Show the image with a draggable 3×3 grid overlay the user positions over the cube face in the photo.
5. "Extract Colors" samples each cell via `sampleRegion()` from `colorClassifier.ts`.
6. Show detected colors, allow cell-by-cell manual correction.
7. When all 6 faces confirmed: call `onComplete(state)`.

### Grid overlay
Render an SVG overlay on top of the image. The grid starts centered and the user can drag it to reposition. Keep it simple — drag the whole grid, no per-handle resizing for now.

### Dependencies
No extra npm packages. Uses native file input.

### Integration
Add "Upload" tab in `solve/page.tsx` alongside "Manual" and "Camera".

---

## Feature 5: Animated Face Turns in RubiksCube3D (~4h)

**File**: `web/src/components/RubiksCube3D.tsx`

### New props
```typescript
interface Props {
  state?: CubeState;
  size?: number;
  autoRotate?: boolean;
  move?: string | null;        // "F", "R'", "U2", etc.
  animDuration?: number;       // ms, default 400
  onMoveComplete?: () => void; // called when CSS transition ends
}
```

### Animation approach

When `move` changes to a non-null value:

1. Identify the sticker indices that belong to the moving layer (face stickers + adjacent ring). For each of the 18 moves this is a fixed set of cell indices, derivable from the same logic as `applyMove()` in `cubeState.ts`.
2. Wrap those stickers in a temporary `<div>` group with `transform-style: preserve-3d`. Position the group at the cube center.
3. Apply a CSS transition: `transform: rotate[X/Y/Z](±90deg)` over `animDuration` ms.
4. On `transitionend`: call `onMoveComplete()`. The parent updates `state` to the post-move value and clears `move`.

### Face → rotation axis mapping
| Face | Clockwise rotation | Axis | Angle |
|------|--------------------|------|-------|
| UP (0) | U | rotateY | +90° |
| LEFT (1) | L | rotateX | −90° |
| FRONT (2) | F | rotateZ | +90° |
| RIGHT (3) | R | rotateX | +90° |
| BACK (4) | B | rotateZ | −90° |
| DOWN (5) | D | rotateY | −90° |

Prime moves invert the angle. Double moves use ±180°.

### State during animation
Show the **pre-move** state on all stickers while animating. Only swap to the **post-move** state after `transitionend` fires. This prevents stickers from "jumping" mid-animation.

---

## Feature 6: Animation + SolutionPlayer Integration (~3h)

**File**: `web/src/components/SolutionPlayer.tsx`

### Changes

Replace the instant step-update with an animation gate:

```typescript
const [animatingMove, setAnimatingMove] = useState<string | null>(null);

function advance() {
  if (step >= moves.length || animatingMove) return;
  setAnimatingMove(moves[step]);
}

function handleMoveComplete() {
  setStep(s => s + 1);
  setAnimatingMove(null);
  if (playing) advance(); // chain next move if still playing
}
```

Pass `move={animatingMove}` and `onMoveComplete={handleMoveComplete}` to `<RubiksCube3D>`.

Clicking a move badge or skip buttons bypasses animation — they set `step` directly and clear `animatingMove`.

### Speed control
Add a speed selector (Slow / Normal / Fast → 800ms / 400ms / 200ms). Pass selected duration as `animDuration` to `<RubiksCube3D>`.

---

## Feature 7: Polish — Mobile, Loading, Glassmorphism (~3h)

### Mobile (`web/src/components/RubiksCube3D.tsx`)
Add touch event handlers mirroring the existing pointer events:
```typescript
onTouchStart={e => onPointerDown(e.touches[0] as unknown as React.PointerEvent)}
onTouchMove={e => onPointerMove(e.touches[0] as unknown as React.PointerEvent)}
onTouchEnd={onPointerUp}
```
Also add `touch-action: none` CSS to prevent page scroll while rotating the cube.

### Mobile (`web/src/components/ManualColorPicker.tsx`)
- Increase cell size on small screens: `w-9 h-9 sm:w-10 sm:h-10`
- Input tabs should be horizontally scrollable: `overflow-x-auto flex-nowrap`

### Loading state (`web/src/app/solve/page.tsx`)
- Add a pulsing skeleton placeholder in the right column while solving.
- After 8s of loading, change message to: "Server is starting up — this may take up to 30 seconds on first use."
- Add a **Cancel** button that calls `controller.abort()` on the in-flight fetch.

### Glassmorphism (`web/src/app/globals.css` + `solve/page.tsx`)
- Add hover glow on the Solve button: `shadow-indigo-500/50 hover:shadow-indigo-500/80`
- Move badge hover: subtle `bg-white/5` background transition
- Add `color-scheme: dark` to `<html>` in `layout.tsx` so browser native elements (scrollbars, file inputs) match the dark theme.

---

## Verification Plan

### Feature 1 — colorClassifier
```bash
cd web && npx jest src/lib/colorClassifier.test.ts
```
All known RGB → Color mappings pass.

### Feature 2 — Parity validation
- Solved cube input → no errors
- Manually construct a twisted-corner state (swap two stickers in one corner) → "Corner orientation parity error" shown

### Feature 3 — Webcam
- Open `/solve` → click "Camera" tab → camera stream appears
- Hold a solved face → detected colors all correct
- Deny camera permission → fallback message shown
- Complete all 6 faces → cube state set, switch to Manual view for review

### Feature 4 — Image upload
- Upload 6 face photos of a solved cube → `validate()` passes
- Correct one wrong cell manually → reflected in final state

### Feature 5 + 6 — Animations
- Start solution playback → each move shows a smooth face rotation
- "Skip to end" jumps instantly with no animation
- Play/pause works mid-animation (no double-advance)
- Speed selector changes animation duration

### Feature 7 — Polish
- Open on mobile browser → ManualColorPicker cells are large enough to tap
- Drag-to-rotate cube works with a single finger
- Cancel button aborts an in-progress solve request
- `color-scheme: dark` applied → browser scrollbars are dark
