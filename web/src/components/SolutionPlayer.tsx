'use client';

import { CubeState, computeCubeStates } from '@/lib/cubeState';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import RubiksCube3D from './RubiksCube3D';

interface Props {
  initialState: CubeState;
  moves: string[];
}

const SPEEDS = [
  { label: 'Slow', ms: 800 },
  { label: 'Normal', ms: 400 },
  { label: 'Fast', ms: 180 },
];

export default function SolutionPlayer({ initialState, moves }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animatingMove, setAnimatingMove] = useState<string | null>(null);
  const [speed, setSpeed] = useState(400);

  const cubeStates = computeCubeStates(initialState, moves);

  // Reset when a new solution arrives
  useEffect(() => {
    setStep(0);
    setPlaying(false);
    setAnimatingMove(null);
  }, [moves]);

  // Auto-advance: when playing and no animation in flight, trigger next move
  useEffect(() => {
    if (!playing || animatingMove !== null) return;
    if (step >= moves.length) { setPlaying(false); return; }
    const t = setTimeout(() => setAnimatingMove(moves[step]), 80);
    return () => clearTimeout(t);
  }, [playing, animatingMove, step, moves]);

  function handleMoveComplete() {
    setAnimatingMove(null);
    setStep((s) => s + 1);
  }

  function jumpTo(target: number) {
    setAnimatingMove(null);
    setPlaying(false);
    setStep(Math.max(0, Math.min(moves.length, target)));
  }

  const currentState = cubeStates[step];

  return (
    <div className="flex flex-col gap-4">
      {/* 3D Cube */}
      <div className="flex justify-center">
        <RubiksCube3D
          state={currentState}
          size={160}
          move={animatingMove}
          animDuration={speed}
          onMoveComplete={handleMoveComplete}
        />
      </div>

      {/* Step counter */}
      <div className="text-center text-sm text-gray-400">
        Step <span className="text-white font-semibold">{step}</span> of{' '}
        <span className="text-white font-semibold">{moves.length}</span>
        {step === moves.length && (
          <span className="ml-2 text-green-400 font-semibold">✓ Solved!</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${moves.length ? (step / moves.length) * 100 : 0}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex justify-center items-center gap-3">
        <button
          onClick={() => jumpTo(0)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          title="Reset"
        >⏮</button>
        <button
          onClick={() => jumpTo(step - 1)}
          disabled={step === 0}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-40"
        >‹</button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={step === moves.length}
          className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium disabled:opacity-40"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={() => {
            if (!animatingMove) setAnimatingMove(moves[step]);
          }}
          disabled={step === moves.length || !!animatingMove || playing}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-40"
        >›</button>
        <button
          onClick={() => jumpTo(moves.length)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          title="Skip to end"
        >⏭</button>
      </div>

      {/* Speed selector */}
      <div className="flex justify-center gap-2">
        {SPEEDS.map(({ label, ms }) => (
          <button
            key={label}
            onClick={() => setSpeed(ms)}
            className={clsx(
              'px-3 py-1 rounded text-xs transition-colors',
              speed === ms
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Move badges */}
      <div className="flex flex-wrap gap-1.5 justify-center max-h-28 overflow-y-auto">
        {moves.map((m, i) => (
          <button
            key={i}
            onClick={() => jumpTo(i + 1)}
            className={clsx(
              'px-2.5 py-1 rounded text-sm font-mono font-medium border transition-all',
              i < step
                ? 'bg-green-900/50 border-green-700 text-green-300'
                : i === step
                ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-md'
                : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-white/5 hover:border-gray-400'
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
