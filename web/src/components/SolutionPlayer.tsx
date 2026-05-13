'use client';

import { CubeState, computeCubeStates } from '@/lib/cubeState';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import RubiksCube3D from './RubiksCube3D';

interface Props {
  initialState: CubeState;
  moves: string[];
}

export default function SolutionPlayer({ initialState, moves }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cubeStates = computeCubeStates(initialState, moves);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [moves]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep((s) => {
          if (s >= moves.length) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      }, 800);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, moves.length]);

  const currentState = cubeStates[step];

  return (
    <div className="flex flex-col gap-4">
      {/* 3D Cube */}
      <div className="flex justify-center">
        <RubiksCube3D state={currentState} size={160} />
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
          onClick={() => { setStep(0); setPlaying(false); }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          title="Reset"
        >⏮</button>
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
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
          onClick={() => setStep((s) => Math.min(moves.length, s + 1))}
          disabled={step === moves.length}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-40"
        >›</button>
        <button
          onClick={() => { setStep(moves.length); setPlaying(false); }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          title="Skip to end"
        >⏭</button>
      </div>

      {/* Move badges */}
      <div className="flex flex-wrap gap-1.5 justify-center max-h-28 overflow-y-auto">
        {moves.map((move, i) => (
          <button
            key={i}
            onClick={() => { setStep(i + 1); setPlaying(false); }}
            className={clsx(
              'px-2.5 py-1 rounded text-sm font-mono font-medium border transition-all',
              i < step
                ? 'bg-green-900/50 border-green-700 text-green-300'
                : i === step
                ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-md'
                : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
            )}
          >
            {move}
          </button>
        ))}
      </div>
    </div>
  );
}
