'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import WebcamScanner from '@/components/WebcamScanner';
import ImageUpload from '@/components/ImageUpload';
import { CubeState, serialize } from '@/lib/cubeState';
import type { SolverStatus } from '@/lib/browserSolver';
import { PUZZLES, getPuzzle } from '@/lib/puzzles';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';
type InputTab = 'manual' | 'camera' | 'upload';
type SolveMode = 'fast' | 'optimal';

// Scramble length is not solution length: any cube is at most 20 moves from
// solved (God's number) however long the scramble, so 25 costs nothing - a
// random-move scramble that long just lands on a typical ~18-move-deep state.
const MAX_SHUFFLE_DEPTH = 25;
// Depth past which the *optimal* backend gets slow. Fast mode does not care.
const SLOW_SHUFFLE_DEPTH = 13;

const LOADING_MESSAGES = [
  'Connecting to solver...',
  'Waking up server...',
  'Loading pattern database...',
  'Solving your cube...',
];

export default function SolvePage({ puzzleId }: { puzzleId: string }) {
  const puzzle = getPuzzle(puzzleId)!;
  const [cubeState, setCubeState] = useState<CubeState>(puzzle.createSolvedState);
  const [inputTab, setInputTab] = useState<InputTab>('manual');
  const [solveStatus, setSolveStatus] = useState<SolveStatus>('idle');
  const [solution, setSolution] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Defaults to 12 so Optimal mode (cost ~5-8x per extra move) still returns;
  // Fast mode handles any depth.
  const [shuffleDepth, setShuffleDepth] = useState(puzzle.defaultScrambleDepth);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<SolveMode>('fast');
  const [solverStatus, setSolverStatus] = useState<SolverStatus>('idle');
  const [lastSolveMs, setLastSolveMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Build the solver's tables straight away. It takes a second or two in a
  // worker, and starting now means it finishes long before the user has
  // finished entering their cube.
  useEffect(() => {
    const { solver } = puzzle;
    setSolverStatus(solver.getStatus());
    const unsubscribe = solver.onStatusChange(setSolverStatus);
    solver.warmUp();
    return unsubscribe;
  }, [puzzle]);

  // Only wake the optimal backend if the user actually wants it - on a free
  // tier it sleeps after 15 minutes and takes about a minute to come back.
  useEffect(() => {
    if (mode !== 'optimal') return;
    const backendUrl = process.env.NEXT_PUBLIC_SOLVER_API_URL || '';
    fetch(`${backendUrl}/health`).catch(() => {});
  }, [mode]);

  // Cycle loading messages; flag slow load after 8s
  useEffect(() => {
    if (solveStatus !== 'loading') {
      setSlowLoad(false);
      return;
    }
    const msgInterval = setInterval(() => {
      setLoadingMsgIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 5000);
    const slowTimer = setTimeout(() => setSlowLoad(true), 8000);
    return () => {
      clearInterval(msgInterval);
      clearTimeout(slowTimer);
    };
  }, [solveStatus]);

  function handleStateChange(next: CubeState) {
    setCubeState(next);
    setValidationErrors([]);
    if (solveStatus === 'error') setSolveStatus('idle');
  }

  function handleShuffle() {
    const { state } = puzzle.generateScramble(shuffleDepth);
    handleStateChange(state);
    setSolveStatus('idle');
    setSolution([]);
  }

  function handleCancel() {
    abortRef.current?.abort();
    setSolveStatus('idle');
    setLoadingMsgIdx(0);
  }

  async function handleSolve() {
    const { valid, errors } = puzzle.validate(cubeState);
    if (!valid) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setSolveStatus('loading');
    setLoadingMsgIdx(0);
    setLastSolveMs(null);

    if (mode === 'fast') {
      try {
        const { moves, solveMs } = await puzzle.solver.solve(cubeState);
        setSolution(moves);
        setLastSolveMs(solveMs);
        setSolveStatus('solved');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Solver failed');
        setSolveStatus('error');
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_SOLVER_API_URL || '';
      const res = await fetch(`${backendUrl}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cubeState: serialize(cubeState) }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setSolution(data.moves as string[]);
        if (typeof data.elapsedMs === 'number') setLastSolveMs(data.elapsedMs);
        setSolveStatus('solved');
      } else {
        setErrorMsg(data.error ?? 'Solver returned an error');
        setSolveStatus('error');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setErrorMsg('Network error — cannot reach the solver server.');
      setSolveStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-slate-100 flex flex-col">
      {/* ── Header (Sticky on mobile) ───────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass border-b-0 border-slate-800/50 px-4 py-3 sm:px-6 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-sm">
        <Link href="/" className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm sm:text-base font-medium">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="h-4 w-px bg-slate-700 hidden sm:block" />
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Kubrick</h1>
        <nav className="ml-auto flex bg-slate-900/50 p-1 rounded-xl border border-white/5" aria-label="Puzzle">
          {PUZZLES.map((p) => (
            <Link
              key={p.id}
              href={`/solve/${p.id}`}
              aria-current={p.id === puzzle.id ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                p.id === puzzle.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-3 py-4 sm:px-6 sm:py-8 flex flex-col lg:flex-row gap-4 sm:gap-8 relative z-10">
        
        {/* Left Col: Input */}
        <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
          <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 shadow-xl shadow-black/20">
            
            {/* Tab bar (wrapping gracefully on narrow screens) */}
            <div className="flex flex-wrap items-center gap-2">
              {puzzle.scan && <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
                {(['manual', 'camera', 'upload'] as InputTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setInputTab(tab)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      inputTab === tab
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab === 'manual' ? 'Manual' : tab === 'camera' ? 'Camera' : 'Upload'}
                  </button>
                ))}
              </div>}
              
              {inputTab === 'manual' && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-900/50 rounded-lg border border-white/5 px-2 py-1">
                    <label htmlFor="shuffle-depth" className="text-xs text-slate-500 whitespace-nowrap">Depth</label>
                    <input
                      id="shuffle-depth"
                      type="number"
                      min={1}
                      max={MAX_SHUFFLE_DEPTH}
                      value={shuffleDepth}
                      onChange={(e) =>
                        setShuffleDepth(
                          Math.max(1, Math.min(MAX_SHUFFLE_DEPTH, Number(e.target.value) || 1))
                        )
                      }
                      disabled={solveStatus === 'loading'}
                      className="w-10 bg-transparent text-center text-sm font-semibold text-slate-300 outline-none
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    onClick={handleShuffle}
                    disabled={solveStatus === 'loading'}
                    title={
                      puzzle.optimalBackend && shuffleDepth >= SLOW_SHUFFLE_DEPTH
                        ? `Depth ${shuffleDepth} can take 10-30s to solve`
                        : `Scramble ${shuffleDepth} moves`
                    }
                    className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold
                      bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors border border-white/5"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                    Shuffle
                  </button>
                </div>
              )}
            </div>

            {/* Input Component */}
            <div className="min-h-[300px]">
              {inputTab === 'manual' && <ManualColorPicker state={cubeState} onChange={handleStateChange} layers={puzzle.layers} />}
              {inputTab === 'camera' && (
                <WebcamScanner
                  onComplete={(state) => { handleStateChange(state); setInputTab('manual'); }}
                  onCancel={() => setInputTab('manual')}
                />
              )}
              {inputTab === 'upload' && (
                <ImageUpload
                  onComplete={(state) => { handleStateChange(state); setInputTab('manual'); }}
                />
              )}
            </div>

            {/* Validation Errors */}
            {inputTab === 'manual' && validationErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 sm:p-4 animate-fade-in-up">
                <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Invalid Cube State
                </div>
                <ul className="text-xs sm:text-sm text-red-300/80 flex flex-col gap-1.5 ml-6 list-disc marker:text-red-500/50">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* Solve Actions */}
            {inputTab === 'manual' && (
              <div className="flex flex-col gap-3 mt-auto pt-2 border-t border-white/5">

                {/* ── Fast vs optimal ───────────────────────────────────── */}
                <div className="flex flex-col gap-1.5">
                  {puzzle.optimalBackend && <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setMode('fast')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        mode === 'fast'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Fast
                      <span className="hidden sm:inline font-normal opacity-70"> · {puzzle.solverLabel}</span>
                    </button>
                    <button
                      onClick={() => setMode('optimal')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        mode === 'optimal'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Optimal
                      <span className="hidden sm:inline font-normal opacity-70"> · fewest moves, slow</span>
                    </button>
                  </div>}

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {mode === 'fast' ? (
                      solverStatus === 'ready' ? (
                        <>{puzzle.solverBlurb}</>
                      ) : solverStatus === 'unavailable' ? (
                        <span className="text-amber-400/80">
                          Your browser cannot run the in-page solver.{puzzle.optimalBackend && ' Switch to Optimal.'}
                        </span>
                      ) : (
                        <>Preparing the in-browser solver…</>
                      )
                    ) : (
                      <>Shortest possible solution from the C++ IDA* server. Cost rises steeply with
                      scramble depth — past {SLOW_SHUFFLE_DEPTH} moves it may time out.</>
                    )}
                  </p>
                </div>

                <button
                  onClick={handleSolve}
                  disabled={
                    solveStatus === 'loading' ||
                    (mode === 'fast' && solverStatus !== 'ready')
                  }
                  className="btn-shimmer relative w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white text-base sm:text-lg transition-all 
                    shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none overflow-hidden"
                >
                  {solveStatus === 'loading' ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {mode === 'fast' ? 'Solving…' : LOADING_MESSAGES[loadingMsgIdx]}
                    </span>
                  ) : mode === 'fast' && solverStatus !== 'ready' ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Preparing solver…
                    </span>
                  ) : (
                    'Solve Cube'
                  )}
                </button>

                {solveStatus === 'loading' && mode === 'optimal' && (
                  <button
                    onClick={handleCancel}
                    className="w-full py-2.5 text-sm font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors border border-transparent hover:border-slate-600"
                  >
                    Cancel Request
                  </button>
                )}

                {slowLoad && mode === 'optimal' && (
                  <p className="text-xs text-center text-amber-400/80 animate-fade-in-up">
                    <svg className="inline mr-1 -mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Server is waking up. This may take up to 45s on the first request.
                  </p>
                )}

                {solveStatus === 'error' && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 font-medium text-center animate-fade-in-up">
                    {errorMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Solution Player */}
        <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
          <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8 h-full flex flex-col shadow-xl shadow-black/20">
            {solveStatus === 'solved' ? (
              <div className="flex flex-col gap-4 h-full animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Solution Found
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/20">
                    {solution.length === 0 ? '0 moves' : `${solution.length} moves`}
                    {lastSolveMs !== null && (
                      <span className="ml-1.5 font-normal opacity-70">
                        {lastSolveMs < 1000
                          ? `${Math.round(lastSolveMs)} ms`
                          : `${(lastSolveMs / 1000).toFixed(1)} s`}
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="flex-1 pt-2">
                  {solution.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-2 glow-green">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <h3 className="text-xl font-bold text-green-400">Cube is already solved!</h3>
                      <p className="text-sm text-slate-400">Mix it up and try again.</p>
                    </div>
                  ) : (
                    <SolutionPlayer
                      initialState={cubeState}
                      moves={solution}
                      applyMove={puzzle.applyMove}
                      layers={puzzle.layers}
                    />
                  )}
                </div>
              </div>
            ) : solveStatus === 'loading' ? (
              // Loading Skeleton
              <div className="flex flex-col gap-6 h-full p-4 animate-fade-in-up">
                <div className="h-8 w-40 rounded-lg skeleton" />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                  <div className="w-48 h-48 rounded-xl skeleton opacity-50" />
                  <div className="w-full max-w-sm h-3 rounded-full skeleton opacity-50" />
                  <div className="flex gap-3">
                    <div className="w-12 h-10 rounded-lg skeleton opacity-50" />
                    <div className="w-12 h-10 rounded-lg skeleton opacity-50" />
                    <div className="w-24 h-10 rounded-lg skeleton opacity-50" />
                  </div>
                </div>
              </div>
            ) : (
              // Empty State
              <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center animate-fade-in-up">
                <div className="relative w-20 h-20 mb-2">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                  <svg className="relative w-full h-full text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-300">Ready to Solve</h3>
                <p className="text-sm text-slate-500 max-w-xs text-balance">
                  Paint your cube state on the left, then click Solve to generate the optimal path.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
