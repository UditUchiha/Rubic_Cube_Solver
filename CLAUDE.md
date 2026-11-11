# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Branches:** `cpp`, `js` and `ui-threejs` are separate deployable variants, stacked in that order. Read [BRANCHES.md](BRANCHES.md) before committing. Fixes go on the lowest branch they apply to and are merged upward, never down.

## Build Commands

```bash
# Configure (from project root — use MinGW on Windows)
cmake -B build -G "MinGW Makefiles"

# Build all targets
cmake --build build

# Run solver (shuffles 12 moves by default, then solves)
.\build\rubiks_cube_solver.exe            # depth 12, 60s budget
.\build\rubiks_cube_solver.exe 13 120     # depth 13, 120s budget (0 = no limit)

# Generate pattern databases (run once, takes hours, needs ~8GB RAM)
.\build\generate_dbs.exe          # all 3 databases
.\build\generate_dbs.exe corner   # corner only
.\build\generate_dbs.exe edge1    # edge group 1 only
.\build\generate_dbs.exe edge2    # edge group 2 only

# Web frontend
cd web && npm run dev
```

The project uses CMake (minimum 3.20) with C++14. Three executable targets: `rubiks_cube_solver`, `solver_api`, and `generate_dbs`.

`CMAKE_BUILD_TYPE` defaults to `Release`. Do not build the solver unoptimised — IDA* is a brute-force tree search and `-O0` is roughly 5-10x slower, which is the difference between a 13-move scramble solving in seconds and timing out.

## Architecture

### Cube Representations (Model/)

`RubiksCube` is an abstract base class defining the cube interface: `getColor()`, `setColor()`, `isSolved()`, 18 move methods, corner indexing (`getCornerIndex`, `getCornerOrientation`), and edge indexing (`getEdgeIndex`, `getEdgeOrientation`).

Three concrete implementations exist, all interchangeable via templates:
- **RubiksCube3dArray** — `char cube[6][3][3]`, straightforward but slowest
- **RubiksCube1dArray** — `char cube[6][9]`, flattened indexing
- **RubiksCubeBitboard** — `uint64_t bitboard[6]`, fastest. Used by the IDA* solver.

### Solvers (Solver/)

All solvers are header-only templates parameterized on `<T, H>` (cube representation + hash):
- **DFSSolver** — depth-limited DFS
- **BFSSolver** — breadth-first search
- **IDDFSSolver** — iterative deepening
- **IDAstarSolver** — Korf's IDA* using 3 pattern databases (corner + 2 edge groups). Two constructors: one taking 3 database file paths (loads its own), one taking database references (shares already-loaded ones — use this when solving repeatedly). Heuristic: `max(cornerDB, edge1DB, edge2DB)`.
  `solve(timeLimitSeconds)` throws `SolverTimeout` when the budget runs out; `0` means no limit. Always pass a budget in a server context — solve cost grows ~5-8x per extra move (12 moves <1s, 13 ~10-20s, 15 ~10min), so an unbudgeted deep scramble looks indistinguishable from a hang.

### Cube Validation (Model/CubeValidation.h)

`isCubeSolvable(cube, error)` checks the three laws that decide reachability: corner twists sum to 0 mod 3, edge flips sum to 0 mod 2, and corner/edge permutation parity match. Call it before solving — IDA* cannot fail fast on an unsolvable cube, it searches to the God's-number bound first.

Two subtleties, both documented in the header and mirrored in `web/src/lib/cubeState.ts`:
- `getCornerIndex()` numbers corners by colour bits, which orders UBL before UBR, so ids must be mapped back to home slots or the solved cube reads as one transposition from identity.
- `getCornerOrientation()` is not sign-consistent: four corner slots list their facelets in a left-handed cycle, so their twist values must be negated (`o -> (3-o)%3`) before summing. Raw twist sums are uniformly spread over 0/1/2 and carry no information. The pattern database is unaffected — per-corner relabelling is a bijection, so the raw values still index corner states uniquely.

### Pattern Databases (PatternDatabases/)

- **PatternDatabase** — base class with NibbleArray (4-bit entries) and file I/O
- **CornerPatternDatabase** — 88,179,840 entries (8! × 3^7), indexes all 8 corner positions/orientations using `PermutationIndexer<8>`. Max depth 11.
- **EdgePatternDatabase** — 42,577,920 entries (P(12,6) × 2^6), indexes 6-of-12 edge positions/orientations using `PermutationIndexer<12, 6>`. Parameterized by edge group (0 = edges 0-5, 1 = edges 6-11). Max depth ~10.
- **CornerDBMaker / EdgeDBMaker** — BFS generators for pattern databases
- **NibbleArray** — compact 4-bit-per-entry storage
- **PermutationIndexer<N, K>** — Lehmer code for (partial) permutation ranking

Database files: `Databases/corner.db` (44,089,921 bytes), `Databases/edge1.db` and `Databases/edge2.db` (21,288,961 bytes each). Generate with `generate_dbs.exe`.

`PatternDatabase::fromFile` must open with `ios::binary`. Without it the stream is text-mode on Windows and stops at the first 0x1A byte — corner.db has one at offset 18108360, so only 41% of the file loaded and the rest stayed at the 0xFF "unknown" fill, which the heuristic reads as 0.

### Edge Numbering

12 edges indexed 0-11: UF(0), UR(1), UB(2), UL(3), DF(4), DR(5), DB(6), DL(7), FR(8), FL(9), BR(10), BL(11). Group 1 = edges 0-5, Group 2 = edges 6-11.

### Face/Color Conventions

Faces: UP(0), LEFT(1), FRONT(2), RIGHT(3), BACK(4), DOWN(5)
Colors: WHITE(0), GREEN(1), RED(2), BLUE(3), ORANGE(4), YELLOW(5)
Moves enum: L/L'/L2, R/R'/R2, U/U'/U2, D/D'/D2, F/F'/F2, B/B'/B2 (indices 0-17)

## Web App

Next.js 14 frontend (`web/`) with Three.js 3D cube visualization + Express backend (`server/`) calling the C++ solver via `child_process`.

### Two solvers, and when each is used

The UI defaults to **Fast** and only touches the backend in **Optimal**:

| | Fast (default) | Optimal |
|---|---|---|
| Algorithm | Kociemba two-phase (`cubejs`) | Korf IDA* (C++) |
| Runs on | the user's browser, in a Web Worker | the Express/Render backend |
| Solution | ~21-22 moves | provably fewest |
| Time | 50-150ms at any depth | 5-8x more per extra move |

This split exists because IDA* cost is exponential in depth and no amount of hosting fixes that. On the deployed free tier (~0.1 CPU) a 12-move scramble took **21 seconds** and 13+ moves exceeded the 50s limit; the same cube solves in about 90ms in the browser.

`web/src/lib/twoPhase.worker.ts` + `twoPhaseSolver.ts` implement Fast mode:
- `initSolver()` builds pruning tables in ~1.5-3s and **blocks its thread**, so it only ever runs inside the worker, started on page mount so it overlaps with the user entering their cube. An earlier attempt (branch `feature/kociemba-threejs`) put this in a Vercel serverless route, which paid the full table build on every cold start — the algorithm there was correct, the placement was not.
- `stateToFacelets()` maps this project's U L F R B D colour-index layout to cubejs's U R F D L B facelet-letter string, going via centre colours so the non-standard colour scheme (F=red, L=green) doesn't matter.
- Every solution is replayed through `applyMove` before being returned; a move list that doesn't solve the cube raises instead of reaching the user.
- An already-solved cube short-circuits to `[]` — two-phase otherwise returns a pointless 14-move identity sequence.

- `solver_api.cpp` — long-lived process: `solver_api [corner-db] [edge1-db] [edge2-db]`. Loads the databases once, then reads one 54-char state per line on stdin and writes `SOLUTION: <moves>` or `ERROR: <reason>` per line on stdout. Startup progress and `READY` go to stderr. `SOLVER_TIME_LIMIT` (seconds, default 50) bounds each solve; exceeding it returns an `ERROR:` line and keeps the process alive rather than dying and forcing a ~30s database reload.
- `server/index.js` — Express server owning one long-lived solver process. Requests queue (bounded by `SOLVER_MAX_QUEUE`) rather than being rejected, since the solver handles one cube at a time. Restarts use exponential backoff and stop on a `FATAL:` line from the solver.
- `web/src/components/RubiksCube3D.tsx` — Three.js interactive 3D cube (react-three-fiber)
- `web/src/components/SolutionPlayer.tsx` — Animated solution playback with controls
- `web/src/lib/cubeState.ts` — CubeState type, validation, move application

Deployment: Frontend on Vercel, Backend on Render. The backend is now optional — Fast mode works with it down, and `/health` is only pinged when the user selects Optimal, so a free-tier backend isn't woken on every page load. Backend env vars: `SOLVER_PATH`, `CORNER_DB_PATH`, `EDGE1_DB_PATH`, `EDGE2_DB_PATH`, `SOLVER_TIME_LIMIT`, `SOLVER_MAX_QUEUE`, `SOLVER_TIMEOUT`.

### Scan input

`web/src/lib/colorClassifier.ts` classifies all 54 stickers in one pass (`assignCubeColors`) under an exact nine-per-colour quota, using the six centre stickers as live references for the current lighting. Per-sticker threshold classification is kept only for live previews — deciding each sticker alone is what makes red and orange flip under warm light.

Each face has a fixed orientation inside the 54-char state. The scanners show the required top and left neighbour colours per face, because a face captured 90 degrees out produces a correctly-coloured, unsolvable cube.

`web/src/lib/scan.ts` owns `FACE_ORIENTATION` and `finishScan`; both scanners (`WebcamScanner`, `ImageUpload`) finish through it. Manual corrections are recorded explicitly as `Overrides` and dropped per face whenever that face's samples are replaced. When a scan fails validation, `finishScan` tries quarter-turns of up to two faces and keeps the fewest that make the cube solvable (one face recovered 99.8% of the time, two 99.4%). About 0.7% of scans with a real colour mistake get "fixed" into a different valid cube, so a fix is always returned as a note the solve page shows; never apply it silently. A scan that still fails lands in the manual editor with its errors.

Uploaded photos are downscaled to 1600 px on the long side before sampling: iOS Safari caps a canvas at ~16.7 MP and draws larger photos blank. Several photos picked at once are matched to faces by centre colour over all of them together (`matchPhotosToFaces`).

Self-check for the scan logic: `cd web && npx --yes tsx scripts/scan-selfcheck.ts`.

### Theming (ui/instrument-panel branch)

The page is one instrument enclosure: enamel (light) or graphite (dark) ground, `.bezel` panels, thin `.rule-b` rules, `.key` buttons (`.key-primary` is an ink fill, `.key-down` a pressed key), Space Mono (`.mono`) for readouts, keys and headings, Space Grotesk for copy. Both fonts load through `next/font` in `web/src/app/layout.tsx`. The six sticker colours (`.colorbar`) are the only chroma; there is no accent colour, so do not reintroduce indigo, gradients, glass or all-caps labels.

Light/dark via a `dark` class on `<html>`, set before first paint by the inline script in `layout.tsx` (saved choice in `localStorage.theme`, else the OS setting) and flipped by `ThemeToggle`. Tokens live in `web/src/app/globals.css`.
- `slate-*` is still remapped to CSS variables and **reversed in light mode**, which is what keeps the scanners' neutral classes adapting. Use `fg` (`text-fg`, `border-fg/10`) for "foreground" and `var(--muted)` for secondary text; keep `text-white` only on video and photo overlays.
- Pale accent text needs a light pair: `text-red-600 dark:text-red-400`.
- The cube net and 3D cube keep their black body in both themes, as a real cube does.

3D on this branch: `HeroPanel` loops a scramble and its inverse (no solver needed) and reads the notation out beside the cube; the solve page's right panel is a live `RubiksCube3D` that paints on click (`onStickerClick`) and turns a layer when a sticker is dragged (`onFaceTurn`, resolved in `web/src/lib/faceTurn.ts`). Orbit is the component's own turntable drag, not OrbitControls. All honour `prefers-reduced-motion` via `useReducedMotion`.
