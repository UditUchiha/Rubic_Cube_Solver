'use client';

import { CubeState, computeCubeStates } from '@/lib/cubeState';
import { useEffect, useState, useRef, useCallback } from 'react';
import clsx from 'clsx';
import RubiksCube3D from './RubiksCube3D';

interface Props {
  initialState: CubeState;
  moves: string[];
}

const SPEEDS = [
  { label: 'Slow',   ms: 800 },
  { label: 'Normal', ms: 400 },
  { label: 'Fast',   ms: 180 },
];

export default function SolutionPlayer({ initialState, moves }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animatingMove, setAnimatingMove] = useState<string | null>(null);
  const [speed, setSpeed] = useState(400);
  const [cubeSize, setCubeSize] = useState(160);
  const containerRef = useRef<HTMLDivElement>(null);

  const cubeStates = computeCubeStates(initialState, moves);

  // Compute responsive cube size
  const computeSize = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    // max size 240px, or 60% of container width on smaller screens
    setCubeSize(Math.max(120, Math.min(240, Math.floor(w * 0.6))));
  }, []);

  useEffect(() => {
    computeSize();
    const ro = new ResizeObserver(computeSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [computeSize]);

  // Reset when a new solution arrives
  useEffect(() => {
    setStep(0);
    setPlaying(false);
    setAnimatingMove(null);
  }, [moves]);

  // Auto-advance
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
  const isSolved = step === moves.length && moves.length > 0;

  return (
    <div className="flex flex-col gap-5 sm:gap-6" ref={containerRef}>
      
      {/* ── 3D Cube Preview ─────────────────────────────────────────────── */}
      <div className="flex justify-center relative min-h-[160px]">
        {isSolved && (
          <div className="absolute inset-0 pointer-events-none rounded-full glow-green opacity-40 animate-pulse-ring" />
        )}
        <RubiksCube3D
          state={currentState}
          size={cubeSize}
          move={animatingMove}
          animDuration={speed}
          onMoveComplete={handleMoveComplete}
        />
      </div>

      {/* ── Step counter & Progress ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            Step <span className="text-white font-semibold">{step}</span> of <span className="text-white font-semibold">{moves.length}</span>
          </span>
          {isSolved && (
            <span className="text-green-400 font-semibold flex items-center gap-1.5 animate-scale-in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Solved!
            </span>
          )}
        </div>

        <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden border border-white/5 relative">
          <div
            className="absolute top-0 bottom-0 left-0 transition-all duration-300 ease-out"
            style={{ 
              width: `${moves.length ? (step / moves.length) * 100 : 0}%`,
              background: 'linear-gradient(90deg, var(--indigo) 0%, #22c55e 100%)'
            }}
          >
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem' }} />
          </div>
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex justify-center items-center gap-2 sm:gap-3 flex-wrap">
        <button
          onClick={() => jumpTo(0)}
          disabled={step === 0}
          className="p-2 sm:px-3 sm:py-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800/80 transition-colors"
          title="Reset to start"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button
          onClick={() => jumpTo(step - 1)}
          disabled={step === 0}
          className="p-2 sm:px-3 sm:py-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800/80 transition-colors"
          title="Previous move"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={step === moves.length}
          className={clsx(
            'px-6 py-2.5 rounded-xl font-bold transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center',
            playing 
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]',
            step === moves.length && 'opacity-50 cursor-not-allowed shadow-none hover:bg-indigo-600'
          )}
        >
          {playing ? (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
          ) : (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play</>
          )}
        </button>
        <button
          onClick={() => { if (!animatingMove) setAnimatingMove(moves[step]); }}
          disabled={step === moves.length || !!animatingMove || playing}
          className="p-2 sm:px-3 sm:py-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800/80 transition-colors"
          title="Next move"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button
          onClick={() => jumpTo(moves.length)}
          disabled={step === moves.length}
          className="p-2 sm:px-3 sm:py-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800/80 transition-colors"
          title="Skip to end"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
      </div>

      {/* ── Speed ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-center bg-slate-900/50 p-1 rounded-lg w-fit mx-auto border border-white/5">
        {SPEEDS.map(({ label, ms }) => (
          <button
            key={label}
            onClick={() => setSpeed(ms)}
            className={clsx(
              'px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all',
              speed === ms
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Move Badges ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-h-[160px] lg:max-h-32 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {moves.map((m, i) => (
          <button
            key={i}
            onClick={() => jumpTo(i + 1)}
            title={`Jump to step ${i + 1}`}
            className={clsx(
              'px-2.5 py-1.5 rounded-lg text-sm font-mono font-bold transition-all border',
              i < step
                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40' // Past moves
                : i === step
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/25 scale-[1.08] z-10' // Current move
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200' // Future moves
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
