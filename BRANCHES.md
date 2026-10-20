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
