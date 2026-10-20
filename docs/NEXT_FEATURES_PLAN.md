# Next Features Plan

Ten features, in five phases. Phases 1-4 are small and build on code that already exists. Phase 5 has three larger projects, and each one has a decision point before work starts.

## Progress Tracker

| # | Feature | Main file(s) | Est. | Phase | Status |
|---|---------|--------------|------|-------|--------|
| 6 | Web lib tests (Vitest) | `web/src/lib/*.test.ts` | 3h | 1 | ✅ Done |
| 3 | Notation input (`R U R' F2`) | `cubeState.ts`, `solve/page.tsx` | 3h | 1-2 | ✅ Done |
| 1 | Shareable cube links | `solve/page.tsx` | 1h | 2 | ✅ Done |
| 4 | Keyboard controls + a11y in player | `SolutionPlayer.tsx` | 1h | 2 | ✅ Done |
| 2 | Fast vs Optimal comparison | `solve/page.tsx` | 3h | 3 | ✅ Done |
| 5 | IDA* search report | `IDAstarSolver.h`, `solver_api.cpp`, `server/index.js`, `solve/page.tsx` | 5h | 3 | ✅ Done |
| 7 | PWA / offline | `app/manifest.ts`, `public/sw.js` | 3h | 4 | ✅ Done |
| 9 | 2x2 cube | new lib + generalise picker/3D | 2-3d | 5 | ✅ Done |
| 8 | Beginner-method solution | new `lib/beginnerSolver.ts` | 3-5d | 5 | ✅ Done |
| 10 | IDA* in WebAssembly | new `solver_wasm.cpp` | 1d spike | 5 | ⏭ Skipped |

**Sequencing with the UI redesign.** The light/dark redesign is scoped but not started, and it rewrites `solve/page.tsx`. Phase 1 only changes `lib/`, so it doesn't conflict. Features 1, 2 and 5 add UI to `solve/page.tsx`, so either build them before the redesign starts or include them in it. Don't run both in parallel.

---

## Phase 1: Foundation

### Feature 6: Web lib tests (~3h)

There are no tests under `web/` today. Add **Vitest** (dev dependency only; it reads `tsconfig` paths and needs no Babel setup) and a `"test": "vitest run"` script.

Tests to write, starting with the riskiest code:

- `cubeState.test.ts`
  - Each of the 18 moves applied 4 times (2 for half turns) returns the starting state.
  - A move followed by its inverse returns the starting state.
  - `validate()` rejects one twisted corner, one flipped edge, and one swapped edge pair, and accepts any `generateScramble()` output (property loop, ~200 cases).
  - `serialize` / `deserialize` round-trip.
- `twoPhaseSolver.test.ts`
  - `stateToFacelets(createSolvedState())` equals `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`.
  - Call cubejs directly (not through the worker) on 20 random scrambles and replay each solution with `applyMove` to confirm it's solved. `initSolver()` takes about 2s, so give the test a longer timeout.
- `colorClassifier.test.ts`: build 54 synthetic RGB samples (9 per colour, with warm-light red/orange shifts) and confirm `assignCubeColors` recovers them.
- `parseAlgorithm` tests: see Feature 3.

Cross-checking against the C++ validation is out of scope. The TS port is already documented as matching it.

### Feature 3 (lib part): `parseAlgorithm` (~1h)

Add to `cubeState.ts`:

```ts
export function parseAlgorithm(text: string): { moves: string[] } | { error: string }
```

- Split on whitespace. Accept `’` and `′` as prime, and treat `R2'` as `R2`.
- Allow only the 18 face moves that `applyMove` supports. Wide moves, slices and rotations (`r`, `Rw`, `M`, `x`, ...) return an error that names the token. Supporting them would mean recentring the cube, which breaks the fixed-centre layout.
- Tests: valid input, unicode primes, an invalid token reports its position, and a scramble followed by its reversed inverse returns to solved.

---

## Phase 2: Quick wins

### Feature 1: Shareable cube links (~1h)

- **Reading:** on mount, use `new URLSearchParams(window.location.search).get('s')`, then `deserialize()`, then `validate()`. If the state is valid, load it with `handleStateChange`. If not, show the existing validation-error box. Reading `window.location` in a `useEffect` avoids `useSearchParams`, which in Next 14 would need a Suspense boundary on the page.
- **Writing:** add a "Copy link" button next to the move-count badge in the solution header. It writes ``navigator.clipboard.writeText(`${location.origin}/solve?s=${serialize(cubeState)}`)`` and shows "Copied" for 2s.
- Not included: live URL updates while painting, and putting the mode in the URL.

### Feature 3 (UI part): Notation input (~2h)

- Add a fourth input tab, **Notation**, with a textarea and an Apply button. It runs `parseAlgorithm`, folds `applyMove` over the solved state, and calls `handleStateChange`. Errors go in the existing red box.
- Shuffle currently throws away the moves `generateScramble` returns. Put them in the Notation text so users can copy the scramble.
- A state built from notation is always solvable, so it skips validation errors.

### Feature 4: Keyboard controls + a11y in SolutionPlayer (~1h)

- Add a `keydown` listener on `window` in an effect, and ignore events whose target is an input or textarea.
  - `←` calls `jumpTo(step - 1)`.
  - `→` does the same thing as the existing step-forward button (`if (!animatingMove) setAnimatingMove(moves[step])`).
  - `Space` toggles play (call `preventDefault` so the page doesn't scroll).
  - `Home` / `End` call `jumpTo(0)` / `jumpTo(moves.length)`.
- Add `aria-label` to the icon-only buttons (lines 129-170), `aria-current="step"` on the active move chip, and an `aria-live="polite"` "Move 3 of 18: R'" readout.

---

## Phase 3: Showing what the solvers do

### Feature 2: Fast vs Optimal comparison (~3h)

- Refactor `handleSolve` into `solveWith(mode): Promise<{ moves, ms }>` and keep the current mode-toggle behaviour.
- Add state `results: { fast?: Result; optimal?: Result }`. Clear it in `handleStateChange`, because a result belongs to one cube.
- After a solve, show an "Also solve with Optimal/Fast" button. Once both results exist, show a comparison strip above the player:
  `Fast · 21 moves · 90 ms   |   Optimal · 18 moves · 4.2 s   → optimal saves 3 moves`
  Clicking a side loads that solution into `SolutionPlayer`.
- Both solvers count moves in the half-turn metric (`R2` = 1), so the numbers are comparable without conversion.
- An Optimal timeout (depth 14 and up) appears as an error inside the Optimal side of the strip. The Fast result stays.

### Feature 5: IDA* search report (~5h)

Showing this after the solve, not live, gives most of the teaching value for a fraction of the work. Live streaming would need SSE plus per-request event channels in the server, which isn't worth it on a ~0.1 CPU free tier. The protocol change below is the groundwork if it's ever wanted.

**C++ (`Solver/IDAstarSolver.h`)**
- Record a `vector<pair<int, uint64_t>> iterations` of (bound, nodes expanded in that iteration) in the `while (bound != -1)` loop of `solve()`.
- Add `void heuristicParts(const T&, int &corner, int &edge1, int &edge2) const` next to `heuristic()` (line 36).

**C++ (`solver_api.cpp`)**
- Before `SOLUTION:`, print one line:
  `STATS: {"h":{"corner":8,"edge1":7,"edge2":9},"iterations":[[9,412],[10,5180],...],"nodes":123456}`
  Format it by hand with `ostringstream` (C++14, no JSON library).
- Timeouts print stats as well, since "searched 40M nodes up to bound 15" is useful on its own.

**Server (`server/index.js`)**
- Right now any stdout line resolves the pending request (lines 56-76). Change that so a `STATS:` line is stored on `pendingRequest.stats` and processing continues. Only a `SOLUTION:` or `ERROR:` line resolves the request.
- Include `stats` in both the success and error JSON.
- **Deploy order:** backend first. The old frontend ignores the extra field, and the new frontend has to handle a missing `stats`.

**UI**
- Add a collapsible "How the search went" panel under Optimal results:
  - starting estimate `h = max(corner 8, edge1 7, edge2 9) = 9`
  - a small table of bound → nodes per iteration, which shows the exponential growth
  - total nodes and nodes per second.

---

## Phase 4: Feature 7, PWA / offline (~3h)

Fast mode already runs entirely in the browser, so it can work offline.

- `web/src/app/manifest.ts` (a Next 14 metadata route): name "Kubrick", `display: standalone`, theme colours, icons.
- `web/public/` doesn't exist yet. Create it with `icon-192.png`, `icon-512.png` and `sw.js`.
- `sw.js`, written by hand with no `next-pwa`/`serwist` dependency:
  - cache-first for `/_next/static/*` (hashed, so safe to cache; this includes the cubejs worker chunk)
  - network-first with cache fallback for pages
  - never cache the solver API
  - a versioned cache name, with old caches deleted on `activate`.
- Register the worker from a tiny client component in `layout.tsx`, in production builds only. In dev it would serve stale chunks.
- Optimal mode offline shows the existing network error. Add "You're offline; Fast mode still works."
- Verify with a DevTools Lighthouse PWA check, then go offline, reload, and solve in Fast mode.

---

## Phase 5: Larger projects (decide each one before starting)

### Feature 9: 2x2 cube (~2-3 days)

The solver is the easy part. Most of the cost is making the UI work for a second cube size.

- **Solver (TS, in a worker):** the 2x2 has 3,674,160 states. Fix one corner, then BFS a distance table indexed by 7! × 3^6, using 1 byte per entry (~3.7MB). Building it takes about 1s in a worker. To solve optimally, repeatedly take the move that lowers the distance. No C++ or backend work is needed.
- **UI:** `RubiksCube3D` and `ManualColorPicker` hard-code 3x3 geometry (about 10 and 16 places). Parameterise them on `n`. Add a 2x2 / 3x3 toggle to the solve page, and support only Manual and Notation input for 2x2 (no scanners).
- **Risk:** this generalisation touches the same files as the redesign, so do it after the redesign.

### Feature 8: Beginner-method solution (~3-5 days)

Output is `{ stage: string; moves: string[] }[]`. `SolutionPlayer` gets an optional `stages` prop and shows chapter markers ("White cross", "First layer corners", ...).

- **Approach:** solve the first stages (cross, corners, middle edges) with a short IDDFS per stage over the 18 moves, using a goal predicate per stage. Each piece is at most about 8 moves deep, which is fine in a worker. Solve the last-layer stages with a fixed table of standard algorithms (sune, edge cycles, corner swaps), trying each with `U` pre-turns until the stage predicate holds.
- Measured over 1000 scrambles: about 154 moves on average (max 216), in about 10ms. That is what the beginner method costs, and the point is that users can follow it.
- **Risk:** the stage predicates and algorithm table need careful testing. Use a property test over 1000 random scrambles where every stage predicate must end true and the final state must be solved.

### Feature 10: IDA* in WebAssembly (1-day spike, then go/no-go)

- **Spike:** build `solver_wasm.cpp` (the bitboard cube, the DBs and `IDAstarSolver`) with Emscripten. Load the DBs (~86MB total) into a worker through `fetch` plus the Cache API, and time a 12-move solve.
- **Go only if** a 12-move solve finishes in under 5s on a mid-range laptop **and** the 86MB one-time download is acceptable. Otherwise drop it. A corner-only DB (44MB) would make the heuristic much weaker and the search much slower.
- **If it goes ahead,** Optimal mode no longer needs the Render backend, and `server/` can be retired.
- **Recommendation:** skip this unless the backend becomes a problem. Fast mode already covers the no-server case.

---

## Verification

| Feature | Check |
|---|---|
| 6 | `npm test` passes, and CI (if added) runs it |
| 3 | Paste `R U R' U'` ×6, which returns to solved; an invalid token shows its position |
| 1 | Copy link, open it in a private window, and the same cube loads; a tampered `s=` shows a validation error |
| 4 | Every control works with the keyboard alone; a screen reader announces each move |
| 2 | On a 10-move scramble both results show, and Optimal ≤ Fast; Optimal times out at depth 15 while Fast still shows |
| 5 | Iteration bounds increase by 1 each time, the last bound equals the solution length, and old frontend + new backend still works |
| 7 | Lighthouse installable; offline reload and Fast solve work |
| 8, 9 | Property test over 1000 scrambles |
| 10 | Spike timing recorded here before deciding |
