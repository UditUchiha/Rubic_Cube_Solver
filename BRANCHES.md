# Branches

Each solver/UI variant lives on its own long-lived branch so any of them can go to production at any time. They are stacked: each branch is the one below it plus one change.

```
main              production baseline (Vercel + Render deploy from here)
 └─ cpp           C++ IDA* only - every solve goes to the backend
     └─ js        + in-browser two-phase solver (Fast, default); C++ becomes optional "Optimal"
         └─ ui-threejs   + UI redesign: light/dark theme, 3D preview, paint-on-3D, animated hero/background
```

| Branch | Frontend | Backend needed? |
|---|---|---|
| `cpp` | IDA* via `/api/solve` | Yes, for every solve |
| `js` | Two-phase in a Web Worker, IDA* on request | Only for Optimal mode |
| `ui-threejs` | Same solvers as `js`, new UI | Only for Optimal mode |

`server/` and the C++ solver are the same on all three, so one Render backend serves whichever frontend is live.

### Feature branches and `full`

Each feature branch is deployable on its own. None of them merges into another; they only meet in `full`.

| Branch | Built on | Adds |
|---|---|---|
| `perf/ida-star` | `cpp` | ~4x faster IDA* nodes, multi-threaded search (`SOLVER_THREADS`), `benchmark` command |
| `feature/best-first` | `cpp` | The original project's priority-queue + hash-map search, now on all three databases. `rubiks_cube_solver <depth> <secs> both` races it against IDA*. Not for Render: memory grows with depth |
| `feature/cpp-two-phase` | `cpp` | Kociemba two-phase in C++; `mode: "fast"` on `/api/solve` |
| `feature/next-features` | `js` | Tests, notation input, share links, keyboard player, Fast vs Optimal compare, IDA* search report, PWA/offline, Beginner mode |
| `feature/multi-puzzle` | `js` | `/solve/[puzzle]` registry and an optimal in-browser 2x2 |
| `feature/camera-scan` | `cpp` | Scan fixes, rotated-face auto-fix, live webcam preview, multi-photo upload. Already merged into `cpp`, so every branch has it |
| `full` | `ui-threejs` | Everything above, plus a four-solver picker: Instant (cubejs), Fast (C++ two-phase), Optimal (IDA*), Beginner |

**Render should build from `full`.** Its backend only adds to the API (`mode`, `stats`), so it serves every frontend variant, and every variant's Optimal mode gets the threaded solver.

After merging a fix up the stack, merge `ui-threejs` into `full` too.

`default-cpp-implementation` is the old working branch (same code as `js`) and `feature/kociemba-threejs` is an abandoned serverless attempt. Neither is maintained.

## Rules

1. **Fixes flow upward, never down.** Commit a fix on the lowest branch it applies to, then merge up: `cpp -> js -> ui-threejs`. Merging down would drag the browser solver into `cpp`, or the redesign into `js`.
2. **New work goes on the top branch it belongs to.** UI work on `ui-threejs`, solver-only work on `cpp` or `js`.
3. **This file lives on `cpp`** and is merged up, so every branch has the same copy.

```bash
# after committing a fix on cpp
git checkout js && git merge cpp
git checkout ui-threejs && git merge js
```

## Shipping a branch to production

Production deploys from `main`. Every other pushed branch also gets a Vercel preview build.

- **Try it:** push the branch and open its Vercel preview URL. Previews need `NEXT_PUBLIC_SOLVER_API_URL` set for the Preview environment, or Optimal mode has no backend.
- **Ship it quickly:** in Vercel, open that branch's deployment and choose *Promote to Production*. Nothing changes in git, so the next push to `main` replaces it.
- **Ship it for good:** open a PR from the branch into `main` and merge it. `main` then is that variant.
- **Roll back:** promote an earlier production deployment in Vercel. Don't force-push `main`.

The backend rarely needs switching, since `server/` is identical on every branch. If it does, change the branch in the Render service's settings.
