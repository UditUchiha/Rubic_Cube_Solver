import type { CubeState, ValidationResult } from './cubeState';
import * as cube3x3 from './cubeState';
import * as cube2x2 from './pocketCube';
import { BrowserSolver } from './browserSolver';
import { twoPhaseSolver } from './twoPhaseSolver';

export interface Puzzle {
  id: string;
  name: string;
  /** Stickers along one edge of a face. The state holds 6 x layers^2 cells. */
  layers: number;
  createSolvedState: () => CubeState;
  validate: (state: CubeState) => ValidationResult;
  applyMove: (state: CubeState, move: string) => CubeState;
  generateScramble: (moveCount: number) => { state: CubeState; moves: string[] };
  defaultScrambleDepth: number;
  /** In-browser solver, used by default. */
  solver: BrowserSolver;
  solverLabel: string;
  solverBlurb: string;
  /** Also offers the C++ IDA* backend as an "Optimal" mode. */
  optimalBackend: boolean;
  /** Camera and photo input work for this puzzle. */
  scan: boolean;
}

const pocketSolver = new BrowserSolver({
  createWorker: () => new Worker(new URL('./pocket.worker.ts', import.meta.url)),
  encode: (state) => state,
  applyMove: cube2x2.applyMove,
  isSolved: cube2x2.isSolved,
});

export const PUZZLES: Puzzle[] = [
  {
    id: '3x3',
    name: '3x3',
    layers: 3,
    createSolvedState: cube3x3.createSolvedState,
    validate: cube3x3.validate,
    applyMove: cube3x3.applyMove,
    generateScramble: cube3x3.generateScramble,
    defaultScrambleDepth: 12,
    solver: twoPhaseSolver,
    solverLabel: '~21 moves, instant',
    solverBlurb: 'Two-phase solver, running in your browser. No server, no waiting.',
    optimalBackend: true,
    scan: true,
  },
  {
    id: '2x2',
    name: '2x2',
    layers: 2,
    createSolvedState: cube2x2.createSolvedState,
    validate: cube2x2.validate,
    applyMove: cube2x2.applyMove,
    generateScramble: cube2x2.generateScramble,
    defaultScrambleDepth: 10,
    solver: pocketSolver,
    solverLabel: 'fewest moves, instant',
    solverBlurb: 'Optimal solver, running in your browser: always the fewest moves possible, never more than 11.',
    optimalBackend: false,
    scan: false,
  },
];

export const getPuzzle = (id: string) => PUZZLES.find((p) => p.id === id);
