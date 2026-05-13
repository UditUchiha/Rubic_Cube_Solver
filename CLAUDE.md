# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Configure (from project root)
cmake -B build

# Build
cmake --build build

# Run (Windows — the solver randomly shuffles then solves)
.\build\Debug\rubiks_cube_solver.exe
```

The project uses CMake (minimum 3.20) with C++14. There is a single executable target `rubiks_cube_solver` defined in `CMakeLists.txt`. No test framework is configured — testing is done by uncommenting blocks in `main.cpp`.

## Architecture

### Cube Representations (Model/)

`RubiksCube` is an abstract base class defining the cube interface: `getColor()`, `isSolved()`, 18 move methods (F/F'/F2 for each of 6 faces), and corner indexing for pattern databases.

Three concrete implementations exist, all interchangeable via templates:
- **RubiksCube3dArray** — `char cube[6][3][3]`, straightforward but slowest
- **RubiksCube1dArray** — `char cube[6][9]`, flattened indexing
- **RubiksCubeBitboard** — `uint64_t bitboard[6]`, each face stored as 8 color slots in a 64-bit int with bit manipulation for moves. This is the fastest representation and the one used by the IDA* solver in `main.cpp`.

Each representation provides its own hash functor (`Hash3d`, `Hash1d`, `HashBitboard`) for use in `unordered_map`.

### Solvers (Solver/)

All solvers are header-only templates parameterized on `<T, H>` (cube representation + hash):
- **DFSSolver** — depth-limited DFS (default depth 8)
- **BFSSolver** — breadth-first search with back-pointer reconstruction
- **IDDFSSolver** — iterative deepening over DFSSolver
- **IDAstarSolver** — IDA* using the corner pattern database as heuristic. This is the primary solver. It takes a database filename in its constructor and loads it via `cornerDB.fromFile()`.

### Pattern Databases (PatternDatabases/)

- **PatternDatabase** — base class storing a `NibbleArray` (4-bit entries) with file I/O (`toFile`/`fromFile`)
- **CornerPatternDatabase** — indexes all 8 corner positions/orientations using `PermutationIndexer<8>` to map cube states to database indices
- **CornerDBMaker** — BFS over all corner states to build the database; run once, then reuse the file
- **NibbleArray** — compact 4-bit-per-entry storage
- **PermutationIndexer** — Lehmer code computation for permutation indexing

The precomputed database file is `Databases/cornerDepth5V1.txt` (~48MB). `main.cpp` uses a Windows-style path (`Databases\\cornerDepth5V1.txt`). To regenerate it, uncomment the `CornerDBMaker` block in `main.cpp`.

### Face/Color Conventions

Faces: UP(0), LEFT(1), FRONT(2), RIGHT(3), BACK(4), DOWN(5)
Colors: WHITE(0), GREEN(1), RED(2), BLUE(3), ORANGE(4), YELLOW(5)
Moves enum: L/L'/L2, R/R'/R2, U/U'/U2, D/D'/D2, F/F'/F2, B/B'/B2 (indices 0–17)

## Planned Web App

`IMPLEMENTATION_PLAN.md` describes a planned full-stack deployment: Next.js frontend on Vercel + Express backend on Render calling the C++ solver via `child_process`. A `solver_api.cpp` CLI entry point accepting a 54-char cube state string is needed but not yet implemented. The cube model also needs a `setColor()` method (currently only `getColor()` exists).
