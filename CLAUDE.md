# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Configure (from project root — use MinGW on Windows)
cmake -B build -G "MinGW Makefiles"

# Build all targets
cmake --build build

# Run solver (randomly shuffles then solves)
.\build\rubiks_cube_solver.exe

# Generate pattern databases (run once, takes hours, needs ~8GB RAM)
.\build\generate_dbs.exe          # all 3 databases
.\build\generate_dbs.exe corner   # corner only
.\build\generate_dbs.exe edge1    # edge group 1 only
.\build\generate_dbs.exe edge2    # edge group 2 only

# Web frontend
cd web && npm run dev
```

The project uses CMake (minimum 3.20) with C++14. Three executable targets: `rubiks_cube_solver`, `solver_api`, and `generate_dbs`.

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
- **IDAstarSolver** — Korf's IDA* using 3 pattern databases (corner + 2 edge groups). Constructor takes 3 database file paths. Heuristic: `max(cornerDB, edge1DB, edge2DB)`.

### Pattern Databases (PatternDatabases/)

- **PatternDatabase** — base class with NibbleArray (4-bit entries) and file I/O
- **CornerPatternDatabase** — 88,179,840 entries (8! × 3^7), indexes all 8 corner positions/orientations using `PermutationIndexer<8>`. Max depth 11.
- **EdgePatternDatabase** — 42,577,920 entries (P(12,6) × 2^6), indexes 6-of-12 edge positions/orientations using `PermutationIndexer<12, 6>`. Parameterized by edge group (0 = edges 0-5, 1 = edges 6-11). Max depth ~10.
- **CornerDBMaker / EdgeDBMaker** — BFS generators for pattern databases
- **NibbleArray** — compact 4-bit-per-entry storage
- **PermutationIndexer<N, K>** — Lehmer code for (partial) permutation ranking

Database files: `Databases/corner.db` (~42MB), `Databases/edge1.db` (~21MB), `Databases/edge2.db` (~21MB). Generate with `generate_dbs.exe`.

### Edge Numbering

12 edges indexed 0-11: UF(0), UR(1), UB(2), UL(3), DF(4), DR(5), DB(6), DL(7), FR(8), FL(9), BR(10), BL(11). Group 1 = edges 0-5, Group 2 = edges 6-11.

### Face/Color Conventions

Faces: UP(0), LEFT(1), FRONT(2), RIGHT(3), BACK(4), DOWN(5)
Colors: WHITE(0), GREEN(1), RED(2), BLUE(3), ORANGE(4), YELLOW(5)
Moves enum: L/L'/L2, R/R'/R2, U/U'/U2, D/D'/D2, F/F'/F2, B/B'/B2 (indices 0-17)

## Web App

Next.js 14 frontend (`web/`) with Three.js 3D cube visualization + Express backend (`server/`) calling the C++ solver via `child_process`.

- `solver_api.cpp` — CLI: `solver_api <54-char-state> [corner-db] [edge1-db] [edge2-db]`
- `server/index.js` — Express server proxying solve requests to the C++ binary
- `web/src/components/RubiksCube3D.tsx` — Three.js interactive 3D cube (react-three-fiber)
- `web/src/components/SolutionPlayer.tsx` — Animated solution playback with controls
- `web/src/lib/cubeState.ts` — CubeState type, validation, move application

Deployment: Frontend on Vercel, Backend on Render. Backend env vars: `SOLVER_PATH`, `CORNER_DB_PATH`, `EDGE1_DB_PATH`, `EDGE2_DB_PATH`.
