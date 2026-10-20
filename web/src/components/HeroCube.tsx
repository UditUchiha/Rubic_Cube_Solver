'use client';

import { useEffect, useMemo, useState } from 'react';
import RubiksCube3D from './RubiksCube3D';
import { computeCubeStates, createSolvedState, generateScramble } from '@/lib/cubeState';
import { useReducedMotion } from '@/lib/useReducedMotion';

const SCRAMBLE_LENGTH = 10;
const MOVE_MS = 320;
const PAUSE_SCRAMBLED_MS = 900;
const PAUSE_SOLVED_MS = 1600;

const invert = (m: string) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`);

// A scramble undone in reverse is a solution, so the loop needs no solver.
function makeLoop(): string[] {
  const { moves } = generateScramble(SCRAMBLE_LENGTH);
  return [...moves, ...moves.slice().reverse().map(invert)];
}

/** Landing-page cube that scrambles itself, then solves itself, forever. */
export default function HeroCube() {
  const reduced = useReducedMotion();
  // Starts empty and fills on mount: a random scramble during SSR would not
  // match the one picked on the client.
  const [moves, setMoves] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const states = useMemo(() => computeCubeStates(createSolvedState(), moves), [moves]);

  useEffect(() => {
    if (reduced || animating) return;
    if (step >= moves.length) {
      const t = setTimeout(() => { setMoves(makeLoop()); setStep(0); }, moves.length ? PAUSE_SOLVED_MS : 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAnimating(true), step === SCRAMBLE_LENGTH ? PAUSE_SCRAMBLED_MS : 40);
    return () => clearTimeout(t);
  }, [reduced, animating, step, moves]);

  return (
    <RubiksCube3D
      fill
      interactive
      autoRotate={!reduced}
      state={states[step]}
      move={animating ? moves[step] : null}
      animDuration={MOVE_MS}
      onMoveComplete={() => { setAnimating(false); setStep((s) => s + 1); }}
    />
  );
}
