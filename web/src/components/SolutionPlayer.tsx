'use client';

import { CubeState, computeCubeStates } from '@/lib/cubeState';
import { Fragment, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import SegmentedControl from './SegmentedControl';
import RubiksCube3D from './RubiksCube3D';

interface Props {
  initialState: CubeState;
  moves: string[];
  /** Named chapters covering `moves` in order, e.g. the beginner method's stages. */
  stages?: { name: string; moves: string[] }[];
}

const SPEEDS = [
  { label: 'slow',   ms: 800 },
  { label: 'normal', ms: 400 },
  { label: 'fast',   ms: 180 },
];

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, 'aria-hidden': true } as const;

export default function SolutionPlayer({ initialState, moves, stages }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animatingMove, setAnimatingMove] = useState<string | null>(null);
  const [speed, setSpeed] = useState(400);
  const [cubeSize, setCubeSize] = useState(160);
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoised: this walks the whole solution and copies 54 cells per move, and
  // it used to re-run on every render - including the ones the animation frame
  // loop triggers for each move.
  const cubeStates = useMemo(
    () => computeCubeStates(initialState, moves),
    [initialState, moves]
  );

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

  const jumpTo = useCallback((target: number) => {
    setAnimatingMove(null);
    setPlaying(false);
    setStep(Math.max(0, Math.min(moves.length, target)));
  }, [moves.length]);

  // Arrow keys step, Space plays/pauses, Home/End jump. Typing in a field and
  // Space on a focused button keep their native behaviour.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === ' ' && target?.closest('button')) return;

      switch (e.key) {
        case 'ArrowLeft': jumpTo(step - 1); break;
        case 'ArrowRight':
          if (step < moves.length && !animatingMove && !playing) setAnimatingMove(moves[step]);
          break;
        case ' ': if (step < moves.length) setPlaying((p) => !p); break;
        case 'Home': jumpTo(0); break;
        case 'End': jumpTo(moves.length); break;
        default: return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, moves, animatingMove, playing, jumpTo]);

  function handleMoveComplete() {
    setAnimatingMove(null);
    setStep((s) => s + 1);
  }


  const currentState = cubeStates[step];
  const isSolved = step === moves.length && moves.length > 0;
  const pad = (n: number) => String(n).padStart(2, '0');

  // First move index of each stage, for chapter headings in the move list.
  const chapterStarts = useMemo(() => {
    let at = 0;
    return (stages ?? []).map((stage) => {
      const start = at;
      at += stage.moves.length;
      return start;
    });
  }, [stages]);
  // Keep the current move in view inside the move list. Scrolls only the list:
  // scrollIntoView would also scroll the page on every move of playback.
  const movesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = movesRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !current) return;
    if (current.offsetTop < list.scrollTop || current.offsetTop + current.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = current.offsetTop - list.clientHeight / 2;
    }
  }, [step]);

  // The stage the next move belongs to (the last one once solved).
  const stageIndex = chapterStarts.filter((start) => start <= Math.min(step, moves.length - 1)).length - 1;

  return (
    <div className="flex flex-col gap-4 sm:gap-5" ref={containerRef}>

      <div className="flex justify-center min-h-[160px]">
        <RubiksCube3D
          state={currentState}
          size={cubeSize}
          move={animatingMove}
          animDuration={speed}
          onMoveComplete={handleMoveComplete}
          interactive
        />
      </div>

      {/* Progress: the six sticker colours fill in as the solution plays. */}
      <div className="flex flex-col gap-2 mono text-sm">
        {stages && stageIndex >= 0 && (
          <p>
            stage {stageIndex + 1} of {stages.length}: <span className="text-fg font-bold">{stages[stageIndex].name}</span>
          </p>
        )}
        <div className="flex items-center justify-between">
          <span aria-live="polite">
            step {pad(step)} / {pad(moves.length)}
            {step > 0 && <span className="sr-only">, last move {moves[step - 1]}</span>}
          </span>
          <span style={{ color: 'var(--muted)' }} role="status">{isSolved ? 'solved' : playing ? 'playing' : 'paused'}</span>
        </div>
        {/* Track is the pressed-key grey, so the white first segment still shows. */}
        <div className="h-2.5 rounded-[2px] overflow-hidden" style={{ border: '1px solid var(--rule-strong)', background: 'var(--key-down)' }}>
          <div
            className="h-full colorbar transition-[width] duration-300 ease-out"
            style={{ width: `${moves.length ? (step / moves.length) * 100 : 0}%`, backgroundSize: `${containerRef.current?.clientWidth ?? 400}px 100%` }}
          />
        </div>
      </div>

      <div className="flex justify-center items-center gap-1.5 sm:gap-2 flex-wrap">
        <button onClick={() => jumpTo(0)} disabled={step === 0} className="key p-2" title="Back to start" aria-label="Back to start">
          <svg {...ICON}><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button onClick={() => jumpTo(step - 1)} disabled={step === 0} className="key p-2" title="Previous move" aria-label="Previous move">
          <svg {...ICON}><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={step === moves.length}
          className={clsx('key px-5 py-2 text-sm min-w-[7ch]', !playing && 'key-primary')}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => { if (!animatingMove) setAnimatingMove(moves[step]); }}
          disabled={step === moves.length || !!animatingMove || playing}
          className="key p-2"
          title="Next move"
          aria-label="Next move"
        >
          <svg {...ICON}><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button onClick={() => jumpTo(moves.length)} disabled={step === moves.length} className="key p-2" title="Skip to end" aria-label="Skip to end">
          <svg {...ICON}><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
      </div>

      <div className="flex justify-center">
        <SegmentedControl
          label="Playback speed"
          value={speed}
          onChange={setSpeed}
          options={SPEEDS.map(({ label, ms }) => ({ value: ms, label }))}
        />
      </div>

      {/* The notation. Done moves dim, the next one is pressed. */}
      <div ref={movesRef} className="relative flex flex-wrap gap-1.5 justify-center max-h-[160px] lg:max-h-32 overflow-y-auto p-1">
        {moves.map((m, i) => (
          <Fragment key={i}>
          {stages && chapterStarts.indexOf(i) >= 0 && (
            <div className="basis-full text-left mono text-xs pt-1" style={{ color: 'var(--muted)' }}>
              {stages[chapterStarts.indexOf(i)].name}
            </div>
          )}
          <button
            onClick={() => jumpTo(i + 1)}
            title={`Jump to step ${i + 1}`}
            aria-current={i === step ? 'step' : undefined}
            className={clsx('key px-2 py-1 text-sm min-w-[3ch]', i < step && 'opacity-45', i === step && 'key-down')}
          >
            {m}
          </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
