# Kubrick

A Rubik's Cube solver: scan or paint your cube, get the solution animated in 3D.

**Live demo: [rubic-cube-solver-gamma.vercel.app](https://rubic-cube-solver-gamma.vercel.app/)**

## Features

- **Optimal solves with IDA\*.** Korf's algorithm, using three pattern databases (173M entries) as an admissible heuristic, so every solution has the fewest moves possible.
- **Fast, multi-threaded search.** About 4x faster per node than the first version, with a configurable number of solver threads.
- **Four solver modes.** Instant, Fast (two-phase), Optimal (IDA\*) and Beginner, so you can trade solve time against solution length.
- **Scan or paint the cube.** Use a webcam or photos, or paint the stickers on a 3D cube. A face scanned the wrong way round is detected and turned back automatically (99.8% of single-face mistakes), and impossible cubes are rejected before solving.
- **3D playback.** The solution animates on a Three.js cube, with light and dark themes.

## How it works

- **C++ solver** (`Solver/`, `PatternDatabases/`): IDA\* with corner and edge pattern databases and a time budget per solve.
- **Solver server** (`server/`, `solver_api.cpp`): a persistent C++ process that keeps the databases in memory, so a solve takes seconds instead of reloading the tables every time.
- **Web app** (`web/`): Next.js, Three.js, deployed on Vercel. The backend runs on Render.

See [BRANCHES.md](BRANCHES.md) for the deployable variants (`cpp`, `js`, `ui-threejs`, `full`) and [CLAUDE.md](CLAUDE.md) for build commands.

## Acknowledgements

The cube representations, basic DFS/BFS/IDDFS solvers and corner pattern database started from [LakshyaMittal3301/rubiks-cube-solver](https://github.com/LakshyaMittal3301/rubiks-cube-solver) by Lakshya Mittal and Shubham Patil.
