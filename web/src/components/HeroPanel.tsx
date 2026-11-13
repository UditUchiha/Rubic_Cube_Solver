'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
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

function Notation({ moves, step, offset }: { moves: string[]; step: number; offset: number }) {
  if (moves.length === 0) return <span style={{ color: 'var(--muted)' }}>waiting</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {moves.map((m, i) => {
        const abs = offset + i;
        return (
          <span
            key={i}
            className={clsx(
              'inline-block min-w-[2ch] px-0.5 rounded-[2px] transition-colors',
              abs < step && 'opacity-45',
              abs === step && 'key-down'
            )}
          >
            {m}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Landing-page instrument: a cube that scrambles and solves itself forever,
 * with the notation it is executing read out beside it.
 */
export default function HeroPanel({ children }: { children?: React.ReactNode }) {
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

  const phase =
    moves.length === 0 ? 'ready' : step < SCRAMBLE_LENGTH ? 'scrambling' : step < moves.length ? 'solving' : 'solved';
  // The step within the current phase, as a mechanical counter would show it.
  const phaseStep = Math.min(step < SCRAMBLE_LENGTH ? step : step - SCRAMBLE_LENGTH, SCRAMBLE_LENGTH);

  return (
    <div className="bezel grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="aspect-square max-h-[440px] w-full lg:border-r" style={{ borderColor: 'var(--rule)' }}>
        <RubiksCube3D
          fill
          interactive
          autoRotate={!reduced}
          state={states[step]}
          move={animating ? moves[step] : null}
          animDuration={MOVE_MS}
          onMoveComplete={() => { setAnimating(false); setStep((s) => s + 1); }}
        />
      </div>

      <div className="flex flex-col">
        <dl className="mono text-sm sm:text-[15px] leading-relaxed">
          <div className="rule-b px-4 py-3 sm:px-5 grid grid-cols-[9ch_1fr] gap-3">
            <dt style={{ color: 'var(--muted)' }}>scramble</dt>
            <dd><Notation moves={moves.slice(0, SCRAMBLE_LENGTH)} step={step} offset={0} /></dd>
          </div>
          <div className="rule-b px-4 py-3 sm:px-5 grid grid-cols-[9ch_1fr] gap-3">
            <dt style={{ color: 'var(--muted)' }}>solution</dt>
            <dd><Notation moves={moves.slice(SCRAMBLE_LENGTH)} step={step} offset={SCRAMBLE_LENGTH} /></dd>
          </div>
          <div className={`px-4 py-3 sm:px-5 grid grid-cols-[9ch_1fr] gap-3 ${children ? 'rule-b' : ''}`}>
            <dt style={{ color: 'var(--muted)' }}>step</dt>
            <dd className="flex gap-6">
              <span>{String(phaseStep).padStart(2, '0')} / {SCRAMBLE_LENGTH}</span>
              <span style={{ color: 'var(--muted)' }}>{reduced ? 'paused' : phase}</span>
            </dd>
          </div>
        </dl>
        {children && <div className="flex-1 flex flex-col justify-end gap-4 px-4 py-5 sm:px-5 sm:py-6">{children}</div>}
      </div>
    </div>
  );
}
