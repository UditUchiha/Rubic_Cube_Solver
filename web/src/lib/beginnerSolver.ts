import { CubeState, CORNERS, EDGES, applyMove, isSolved } from './cubeState';

/*
 * Layer-by-layer ("beginner method") solver: ~150 moves instead of ~20, but
 * every stage is one a person can learn and follow.
 *
 * White is fixed on U in this project, so the first layer is built on top and
 * the last layer is yellow, on the bottom. The standard algorithms are written
 * with yellow on top, so they are turned upside down (FLIP) before use.
 *
 * Only the white cross is searched move by move (IDA* over the white edge
 * stickers, which is quick for one edge at a time). Every later stage tries
 * its algorithms, in all four orientations and with D-layer adjustments, and
 * keeps the shortest sequence that solves the stage without breaking an
 * earlier one. That makes each stage correct by construction: a wrong
 * algorithm here shows up as "no sequence found", never as a bad solution.
 */

export type Stage = { name: string; moves: string[] };

const FACES = ['U', 'L', 'F', 'R', 'B', 'D'];
const ALL_MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);

type Perm = number[];

// perm[j] = index of the sticker that ends up at j after `moves`.
function permOf(moves: string[]): Perm {
  const labels = Array.from({ length: 54 }, (_, i) => i) as unknown as CubeState;
  return moves.reduce(applyMove, labels) as unknown as Perm;
}

const applyPerm = (state: CubeState, perm: Perm): CubeState => perm.map((i) => state[i]);

const home = (i: number) => Math.floor(i / 9);
const solvedAt = (state: CubeState, cells: number[]) => cells.every((i) => state[i] === home(i));

// Merge and cancel neighbouring turns of the same face (U U -> U2, U U' -> -).
function simplify(moves: string[]): string[] {
  const quarter = (m: string) => (m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1);
  const out: string[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0]) {
      out.pop();
      const turns = (quarter(last) + quarter(m)) % 4;
      if (turns) out.push(m[0] + ['', '', '2', "'"][turns]);
    } else {
      out.push(m);
    }
  }
  return out;
}

// Yellow-on-top algorithms -> this cube's yellow-on-bottom (whole-cube x2).
const FLIP: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'R', L: 'L' };
// Whole-cube quarter turn about the U-D axis.
const Y_TURN: Record<string, string> = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };

const relabel = (moves: string[], table: Record<string, string>) =>
  moves.map((m) => table[m[0]] + m.slice(1));
const flipped = (alg: string) => relabel(alg.split(' '), FLIP);

function allOrientations(moves: string[]): string[][] {
  const out = [moves];
  for (let k = 1; k < 4; k++) out.push(relabel(out[k - 1], Y_TURN));
  return out;
}

const U_EDGES = EDGES.slice(0, 4);
const D_EDGES = EDGES.slice(4, 8);
const E_EDGES = EDGES.slice(8, 12);
const U_CORNERS = CORNERS.slice(0, 4);
const D_CORNERS = CORNERS.slice(4, 8);
const FIRST_LAYER = [...U_EDGES.flat(), ...U_CORNERS.flat()];
const FIRST_TWO_LAYERS = [...FIRST_LAYER, ...E_EDGES.flat()];

/*
 * Try up to `maxApps` algorithm applications, each optionally preceded by a D
 * turn, plus a final D turn, and return the shortest sequence that reaches
 * `goal`. Fewer applications always win, so the result reads like a person
 * would do it.
 */
function searchSequence(
  state: CubeState,
  variants: string[][],
  maxApps: number,
  goal: (s: CubeState) => boolean,
  withAdjust = true
): string[] | null {
  const adjusts = withAdjust ? [[], ['D'], ["D'"], ['D2']] : [[]];
  const options = adjusts.flatMap((a) => variants.map((v) => [...a, ...v]));
  const optionPerms = options.map(permOf);
  const adjustPerms = adjusts.map(permOf);

  for (let apps = 0; apps <= maxApps; apps++) {
    let best: string[] | null = null;
    const walk = (s: CubeState, moves: string[], left: number) => {
      if (left === 0) {
        adjusts.forEach((a, i) => {
          if (!goal(applyPerm(s, adjustPerms[i]))) return;
          const candidate = simplify([...moves, ...a]);
          if (!best || candidate.length < best.length) best = candidate;
        });
        return;
      }
      options.forEach((o, i) => walk(applyPerm(s, optionPerms[i]), [...moves, ...o], left - 1));
    };
    walk(state, [], apps);
    if (best) return best;
  }
  return null;
}

// ── Stage 1: white cross, one edge at a time ──────────────────────────────

// where[m][i] = where the sticker at i goes when m is turned.
const WHERE: number[][] = ALL_MOVES.map((m) => {
  const perm = permOf([m]);
  const where = new Array<number>(54);
  perm.forEach((from, to) => { where[from] = to; });
  return where;
});

// Moves needed to bring a sticker from each cell to `target`, ignoring all else.
function distancesTo(target: number): Int8Array {
  const dist = new Int8Array(54).fill(-1);
  dist[target] = 0;
  let frontier = [target];
  while (frontier.length) {
    const next: number[] = [];
    for (const cell of frontier) {
      for (const where of WHERE) {
        // Face turns come in inverse pairs, so forward and backward
        // distances agree.
        const n = where[cell];
        if (dist[n] === -1) { dist[n] = dist[cell] + 1; next.push(n); }
      }
    }
    frontier = next;
  }
  return dist;
}
const CROSS_DIST = U_EDGES.map(([white]) => distancesTo(white));

function findWhiteEdgeSticker(state: CubeState, side: number): number {
  for (const [a, b] of EDGES) {
    if (state[a] === 0 && state[b] === side) return a;
    if (state[b] === 0 && state[a] === side) return b;
  }
  throw new Error('White edge not found');
}

// IDA* on the positions of the white stickers of edges 0..k.
function solveCrossEdge(state: CubeState, k: number): string[] {
  const tracked = U_EDGES.slice(0, k + 1).map(([, sideCell], j) =>
    j < k ? U_EDGES[j][0] : findWhiteEdgeSticker(state, home(sideCell))
  );
  const h = (pos: number[]) => Math.max(...pos.map((p, j) => CROSS_DIST[j][p]));

  const path: string[] = [];
  const dfs = (pos: number[], g: number, bound: number, lastFace: string): boolean => {
    const estimate = h(pos);
    if (estimate === 0) return true;
    if (g + estimate > bound) return false;
    for (let m = 0; m < ALL_MOVES.length; m++) {
      const face = ALL_MOVES[m][0];
      if (face === lastFace) continue;
      path.push(ALL_MOVES[m]);
      if (dfs(pos.map((p) => WHERE[m][p]), g + 1, bound, face)) return true;
      path.pop();
    }
    return false;
  };
  for (let bound = h(tracked); bound <= 12; bound++) {
    if (dfs(tracked, 0, bound, '')) return path;
  }
  throw new Error('Could not place a white edge');
}

// ── Stage 2 helpers: one trigger per white corner slot ────────────────────

/*
 * For each top corner slot, a commutator X D X' D' (or its mirror) that
 * disturbs that slot and nothing else on the top layer. Picked by checking
 * each candidate's effect rather than written down by hand, so it cannot
 * point at the wrong slot.
 */
const CORNER_TRIGGERS: string[][] = U_CORNERS.map((slot) => {
  const others = [...U_EDGES.flat(), ...U_CORNERS.filter((c) => c !== slot).flat()];
  for (const x of ['F', 'R', 'B', 'L']) {
    for (const trigger of [[`${x}'`, "D'", x, 'D'], [x, 'D', `${x}'`, "D'"]]) {
      const perm = permOf(trigger);
      const keepsOthers = others.every((i) => perm[i] === i);
      const movesSlot = slot.some((i) => perm[i] !== i);
      if (keepsOthers && movesSlot) return trigger;
    }
  }
  throw new Error('No trigger for corner slot');
});

const repeat = (moves: string[], times: number) => Array.from({ length: times }, () => moves).flat();

const sameCorner = (state: CubeState, slot: number[]) =>
  slot.map((i) => state[i]).sort().join() === slot.map(home).sort().join();

// ── The solver ────────────────────────────────────────────────────────────

const STAGES: { name: string; run: (s: CubeState) => string[] }[] = [
  {
    name: 'White cross',
    run: (s) => {
      const moves: string[] = [];
      for (let k = 0; k < 4; k++) {
        const edge = solveCrossEdge(s, k);
        s = edge.reduce(applyMove, s);
        moves.push(...edge);
      }
      return moves;
    },
  },
  {
    name: 'White corners',
    run: (s) => {
      const moves: string[] = [];
      for (let k = 0; k < 4; k++) {
        const done = [...U_EDGES.flat(), ...U_CORNERS.slice(0, k + 1).flat()];
        // Pop the corner out of a wrong top slot, line it up below its own
        // slot, then repeat that slot's trigger until it drops in.
        const variants = [
          ...CORNER_TRIGGERS,
          ...[2, 3, 4, 5].map((r) => repeat(CORNER_TRIGGERS[k], r)),
        ];
        const found = searchSequence(s, variants, 2, (t) => solvedAt(t, done));
        if (!found) throw new Error('Could not place a white corner');
        s = found.reduce(applyMove, s);
        moves.push(...found);
      }
      return moves;
    },
  },
  {
    name: 'Middle layer',
    run: (s) => {
      const variants = [
        ...allOrientations(flipped("U R U' R' U' F' U F")),
        ...allOrientations(flipped("U' L' U L U F U' F'")),
      ];
      const moves: string[] = [];
      for (let k = 0; k < 4; k++) {
        const done = [...FIRST_LAYER, ...E_EDGES.slice(0, k + 1).flat()];
        const found = searchSequence(s, variants, 2, (t) => solvedAt(t, done));
        if (!found) throw new Error('Could not place a middle edge');
        s = found.reduce(applyMove, s);
        moves.push(...found);
      }
      return moves;
    },
  },
  {
    name: 'Yellow cross',
    run: (s) => {
      const goal = (t: CubeState) =>
        solvedAt(t, FIRST_TWO_LAYERS) && D_EDGES.every(([d]) => t[d] === 5);
      const found = searchSequence(s, allOrientations(flipped("F R U R' U' F'")), 3, goal);
      if (!found) throw new Error('Could not make the yellow cross');
      return found;
    },
  },
  {
    name: 'Yellow edges',
    run: (s) => {
      const goal = (t: CubeState) => solvedAt(t, [...FIRST_TWO_LAYERS, ...D_EDGES.flat()]);
      const found = searchSequence(s, allOrientations(flipped("R U R' U R U2 R'")), 3, goal);
      if (!found) throw new Error('Could not place the yellow edges');
      return found;
    },
  },
  {
    name: 'Yellow corners: position',
    run: (s) => {
      const goal = (t: CubeState) =>
        solvedAt(t, [...FIRST_TWO_LAYERS, ...D_EDGES.flat()]) &&
        D_CORNERS.every((c) => sameCorner(t, c));
      const found = searchSequence(s, allOrientations(flipped("U R U' L' U R' U' L")), 2, goal, false);
      if (!found) throw new Error('Could not position the yellow corners');
      return found;
    },
  },
  {
    name: 'Yellow corners: twist',
    run: (s) => {
      // Twist the corner at DBR with R' U' R U until yellow faces down, then
      // bring the next corner round. The top layer is scrambled in between
      // and comes back once every corner is done.
      const twist = flipped("R' D' R D");
      const moves: string[] = [];
      for (let k = 0; k < 4; k++) {
        for (let guard = 0; s[53] !== 5; guard++) {
          if (guard === 6) throw new Error('Could not twist a yellow corner');
          s = twist.reduce(applyMove, s);
          moves.push(...twist);
        }
        s = applyMove(s, 'D');
        moves.push('D');
      }
      return simplify(moves);
    },
  },
];

export function solveBeginner(state: CubeState): Stage[] {
  if (state.length !== 54) throw new Error('The beginner method is for a 3x3');
  const stages: Stage[] = [];
  let s = state;
  for (const { name, run } of STAGES) {
    const moves = simplify(run(s));
    s = moves.reduce(applyMove, s);
    if (moves.length) stages.push({ name, moves });
  }
  if (!isSolved(s)) throw new Error('Beginner solver finished without solving the cube');
  return stages;
}
