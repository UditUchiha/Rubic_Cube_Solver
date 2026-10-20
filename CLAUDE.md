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
.\build\rubiks_cube_solver.exe benchmark  # 12 fixed-seed scrambles, depths 10-13: length, nodes, time
.\build\rubiks_cube_solver.exe fast 25   # two-phase instead of IDA*: any depth, ~22 moves, ms

# Two-phase self-check (200 fixed-seed 20-25 move scrambles, asserts on failure)
.\build\test_two_phase.exe

# Generate pattern databases (run once, takes hours, needs ~8GB RAM)
.\build\generate_dbs.exe          # all 3 databases
.\build\generate_dbs.exe corner   # corner only
.\build\generate_dbs.exe edge1    # edge group 1 only
.\build\generate_dbs.exe edge2    # edge group 2 only

# Web frontend
cd web && npm run dev
```

The project uses CMake (minimum 3.20) with C++14. Four executable targets: `rubiks_cube_solver`, `solver_api`, `generate_dbs`, and `test_two_phase`.

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
- **IDAstarSolver** — Korf's IDA* using 3 pattern databases (corner + 2 edge groups). Two constructors: one taking 3 database file paths (loads its own), one taking database references (shares already-loaded ones — use this when solving repeatedly). Heuristic: `max(cornerDB, edge1DB, edge2DB)`, stopping at the first database that already cuts the node.
  `solve(timeLimitSeconds)` throws `SolverTimeout` when the budget runs out; `0` means no limit. Always pass a budget in a server context — solve cost grows ~5-8x per extra move (on a 12-thread desktop: 13 moves <1s, 14 ~3s, 15 ~10-35s), so an unbudgeted deep scramble looks indistinguishable from a hang.
  Each iteration runs on `SOLVER_THREADS` threads (default: all cores; `1` = the plain sequential search). Threads split the tree at depth 2 by ticket and all search the same bound, so solutions stay optimal. More threads do nothing on a fractional-CPU host such as Render free.
  Run `benchmark` before and after any solver change: its scrambles are fixed, so a changed solution length means lost optimality, and with `SOLVER_THREADS=1` node counts should not change either unless pruning did.
- **TwoPhaseSolver<T>** — Kociemba's two-phase algorithm: IDA* to G1 = <U,D,R2,L2,F2,B2>, then IDA* within G1. Not optimal (avg ~21.7 moves, max 22) but depth-insensitive: ~35ms average, <0.35s worst over 200 random 20-25 move scrambles, natively. `solve(timeLimitSeconds, target = 22)` stops at the first solution <= target, or returns the best found when the budget ends. Needs no pattern databases: ~8 MB of move/pruning tables built in 0.5-2s on first use (`twophase::tables()`, shared process-wide). The move cubies are read off this project's own `move()` on a solved cube rather than hand-written, so the search and the model cannot disagree; every solution is replayed on `T` before it is returned.

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
- Every solution is replayed through `applyMove` before being returned (in `browserSolver.ts`, for every in-browser solver); a move list that doesn't solve the cube raises instead of reaching the user.
- An already-solved cube short-circuits to `[]` — two-phase otherwise returns a pointless 14-move identity sequence.

- `solver_api.cpp` — long-lived process: `solver_api [corner-db] [edge1-db] [edge2-db]`. Loads the databases once, builds the two-phase tables, then reads one 54-char state per line on stdin, optionally prefixed `FAST ` (two-phase) or `OPTIMAL ` (IDA*, also the default for a bare state), and writes `SOLUTION: <moves>` or `ERROR: <reason>` per line on stdout. Startup progress and `READY` go to stderr. `SOLVER_TIME_LIMIT` (seconds, default 50) bounds each solve; exceeding it returns an `ERROR:` line and keeps the process alive rather than dying and forcing a ~30s database reload.
- `server/index.js` — Express server owning one long-lived solver process. `POST /api/solve` takes `{ cubeState, mode }`, `mode` being `"optimal"` (default) or `"fast"`. Requests queue (bounded by `SOLVER_MAX_QUEUE`) rather than being rejected, since the solver handles one cube at a time. Restarts use exponential backoff and stop on a `FATAL:` line from the solver.
- `web/src/components/RubiksCube3D.tsx` — Three.js interactive 3D cube (react-three-fiber)
- `web/src/components/SolutionPlayer.tsx` — Animated solution playback with controls
- `web/src/lib/cubeState.ts` — CubeState type, validation, move application

Deployment: Frontend on Vercel, Backend on Render. The backend is now optional — Fast mode works with it down, and `/health` is only pinged when the user selects Optimal, so a free-tier backend isn't woken on every page load. Backend env vars: `SOLVER_PATH`, `CORNER_DB_PATH`, `EDGE1_DB_PATH`, `EDGE2_DB_PATH`, `SOLVER_TIME_LIMIT`, `SOLVER_MAX_QUEUE`, `SOLVER_TIMEOUT`, `SOLVER_THREADS`.

### Puzzles

`/solve/[puzzle]` serves every puzzle from one page (`components/SolvePage.tsx`); `/solve` redirects to `/solve/3x3`. `web/src/lib/puzzles.ts` is the registry: each entry supplies its state model (solved state, `validate`, `applyMove`, scramble), an in-browser `BrowserSolver`, and flags for the C++ Optimal mode and camera input (3x3 only). Cube-family puzzles share `RubiksCube3D` and `ManualColorPicker` via their `layers` prop; state is `6 x layers^2` cells in the same U L F R B D layout. `browserSolver.ts` holds the worker plumbing, so a new solver is a worker file plus one `new BrowserSolver(...)`.

**2x2** (`pocketCube.ts`, `pocket.worker.ts`) is solved optimally by a full BFS distance table — 3,674,160 states, one byte each, built in ~1.5s in its worker — and walked downhill. Its moves are derived from the 3x3 engine (a 2x2 turn is a 3x3 turn on the corner stickers). With no centres, the cube is recoloured so the piece in DBL counts as home, which fixes the target orientation without rotating the cube, so U/R/F solutions apply to the cube as held. Self-check, run from `web/`:

```bash
npx tsc src/lib/pocketCube.check.ts --outDir .check --module commonjs --target es2020 --skipLibCheck && node .check/pocketCube.check.js
```

It compares the table against the published depth distribution and replays 500 solves; run it after touching the 2x2 code or the 3x3 move engine.

### Scan input

`web/src/lib/colorClassifier.ts` classifies all 54 stickers in one pass (`assignCubeColors`) under an exact nine-per-colour quota, using the six centre stickers as live references for the current lighting. Per-sticker threshold classification is kept only for live previews — deciding each sticker alone is what makes red and orange flip under warm light.

Each face has a fixed orientation inside the 54-char state. The scanners show the required top and left neighbour colours per face, because a face captured 90 degrees out produces a correctly-coloured, unsolvable cube.

`web/src/lib/scan.ts` owns `FACE_ORIENTATION` and `finishScan`; both scanners (`WebcamScanner`, `ImageUpload`) finish through it. Manual corrections are recorded explicitly as `Overrides` and dropped per face whenever that face's samples are replaced. When a scan fails validation, `finishScan` tries quarter-turns of up to two faces and keeps the fewest that make the cube solvable (one face recovered 99.8% of the time, two 99.4%). About 0.7% of scans with a real colour mistake get "fixed" into a different valid cube, so a fix is always returned as a note the solve page shows; never apply it silently. A scan that still fails lands in the manual editor with its errors.

Uploaded photos are downscaled to 1600 px on the long side before sampling: iOS Safari caps a canvas at ~16.7 MP and draws larger photos blank. Several photos picked at once are matched to faces by centre colour over all of them together (`matchPhotosToFaces`).

Self-check for the scan logic: `cd web && npx --yes tsx scripts/scan-selfcheck.ts`.

### Theming (ui-threejs branch)

Light/dark via a `dark` class on `<html>`, set before first paint by the inline script in `web/src/app/layout.tsx` (saved choice in `localStorage.theme`, else the OS setting) and flipped by `ThemeToggle`. Tokens live in `web/src/app/globals.css`.
- `slate-*` is remapped to CSS variables and **reversed in light mode** (`bg-slate-800` is a light panel there), so write neutral classes for the dark look and they adapt. Use `fg` (`text-fg`, `border-fg/10`) for "foreground"; keep `text-white` only on indigo fills, video and photo overlays.
- Pale accent text needs a light pair: `text-red-600 dark:text-red-400`.
- The cube net and 3D cube keep their black body in both themes, as a real cube does.

3D extras on this branch: `HeroCube` loops a scramble and its inverse (no solver needed); `CubeField` is the home-page background (one `InstancedMesh`, kept out of the centre column); the solve page's right panel is a live, paintable `RubiksCube3D` (`onStickerClick`). All honour `prefers-reduced-motion` via `useReducedMotion`.
