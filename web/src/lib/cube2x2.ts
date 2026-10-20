import { CubeState, Color, move2x2Permutation } from './cubeState';

/*
 * Optimal 2x2 solver, small enough to run on the main thread.
 *
 * A 2x2 has no centres, so "solved" means every face uniform in whatever
 * orientation the user is holding it. Turning only U, R and F never moves the
 * down-back-left corner, which pins that orientation: DBL's three colours fix
 * the D, B and L faces, and their opposites fix U, F and R.
 *
 * Any 2x2 is at most 11 moves from solved (half-turn metric). Searching 6 moves
 * out from the scramble and 5 out from the solved cube covers every length up
 * to 11 with about 75k states, where a one-sided search would need millions.
 * The shortest path of length L passes a state min(L,6) moves from the
 * scramble and L-min(L,6) <= 5 from solved, so taking the best meeting point
 * over both frontiers is optimal.
 */

// Opposite colours in this project's scheme: W-Y, G-B, R-O.
const OPPOSITE: Record<number, Color> = { 0: 5, 5: 0, 1: 3, 3: 1, 2: 4, 4: 2 };

// DBL corner stickers in the 24-cell layout (face*4 + row*2 + col).
const DBL_D = 22; // D, back-left
const DBL_B = 19; // B, bottom-right as seen from behind
const DBL_L = 6;  // L, bottom-left

const MOVES = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2'];
const INVERSE: Record<string, string> = {};
for (const m of MOVES) INVERSE[m] = m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`;

const FORWARD_DEPTH = 6;
const BACKWARD_DEPTH = 5;

type Visit = { parent: string | null; move: string | null };

function applyPerm(state: string, perm: number[]): string {
  let out = '';
  for (let i = 0; i < 24; i++) out += state[perm[i]];
  return out;
}

function bfs(start: string, depth: number): Map<string, Visit & { depth: number }> {
  const perms = MOVES.map((m) => move2x2Permutation(m)!);
  const seen = new Map<string, Visit & { depth: number }>([[start, { parent: null, move: null, depth: 0 }]]);
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const state of frontier) {
      const lastFace = seen.get(state)!.move?.[0];
      for (let i = 0; i < MOVES.length; i++) {
        if (MOVES[i][0] === lastFace) continue; // two turns of one face are one turn
        const child = applyPerm(state, perms[i]);
        if (seen.has(child)) continue;
        seen.set(child, { parent: state, move: MOVES[i], depth: d });
        next.push(child);
      }
    }
    frontier = next;
  }
  return seen;
}

export function solve2x2(state: CubeState): { moves: string[] } | { error: string } {
  if (state.length !== 24) return { error: 'Expected a 2x2 cube (24 stickers)' };

  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of state) counts[c]++;
  if (counts.some((n) => n !== 4)) {
    return { error: 'Each colour must appear exactly 4 times on a 2x2.' };
  }

  const d = state[DBL_D], b = state[DBL_B], l = state[DBL_L];
  const faces: Color[] = [OPPOSITE[d], l, OPPOSITE[b], OPPOSITE[l], b, d]; // U L F R B D
  if (new Set(faces).size !== 6) {
    return { error: 'The down-back-left corner has impossible colours. Check that corner.' };
  }

  const scrambled = state.join('');
  const target = faces.map((f) => String(f).repeat(4)).join('');
  if (scrambled === target) return { moves: [] };

  const fromScramble = bfs(scrambled, FORWARD_DEPTH);
  const fromSolved = bfs(target, BACKWARD_DEPTH);

  let best: string | null = null;
  let bestLength = Infinity;
  fromSolved.forEach((visit, meet) => {
    const forward = fromScramble.get(meet);
    if (forward && forward.depth + visit.depth < bestLength) {
      bestLength = forward.depth + visit.depth;
      best = meet;
    }
  });
  if (best === null) {
    return { error: "This 2x2 can't be solved. A corner is probably twisted or two stickers are swapped." };
  }

  // Scramble -> meeting point, read backwards along the parent links.
  const moves: string[] = [];
  for (let s: string = best; fromScramble.get(s)!.parent !== null; s = fromScramble.get(s)!.parent!) {
    moves.unshift(fromScramble.get(s)!.move!);
  }
  // Meeting point -> solved: undo each move that led away from solved.
  for (let s: string = best; fromSolved.get(s)!.parent !== null; s = fromSolved.get(s)!.parent!) {
    moves.push(INVERSE[fromSolved.get(s)!.move!]);
  }
  return { moves };
}
