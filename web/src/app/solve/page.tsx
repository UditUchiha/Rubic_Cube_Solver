'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import WebcamScanner from '@/components/WebcamScanner';
import ImageUpload from '@/components/ImageUpload';
import {
  CubeState, createSolvedState, serialize, deserialize, validate, generateScramble,
  parseAlgorithm, applyMove, cubeSize, CubeSize,
} from '@/lib/cubeState';
import { solve2x2 } from '@/lib/cube2x2';
import { solveBeginner, Stage } from '@/lib/beginnerSolver';
import { twoPhaseSolver, SolverStatus } from '@/lib/twoPhaseSolver';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';
type InputTab = 'manual' | 'notation' | 'camera' | 'upload';
type SolveMode = 'fast' | 'optimal' | 'beginner';

// What the IDA* backend reports about its search (see solver_api.cpp).
type SearchStats = {
  h: { corner: number; edge1: number; edge2: number };
  iterations: [bound: number, nodes: number][];
  nodes: number;
};
type SolveResult =
  | { moves: string[]; ms: number | null; stats?: SearchStats | null; stages?: Stage[] }
  | { error: string; stats?: SearchStats | null };

const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

// Scramble length is not solution length: any cube is at most 20 moves from
// solved (God's number) however long the scramble, so 25 costs nothing - a
// random-move scramble that long just lands on a typical ~18-move-deep state.
const DEFAULT_SHUFFLE_DEPTH = 12;
const MAX_SHUFFLE_DEPTH = 25;
// Depth past which the *optimal* backend gets slow. Fast mode does not care.
const SLOW_SHUFFLE_DEPTH = 13;

const LOADING_MESSAGES = [
  'Connecting to solver...',
  'Waking up server...',
  'Loading pattern database...',
  'Solving your cube...',
];

export default function SolvePage() {
  const [cubeState, setCubeState] = useState<CubeState>(createSolvedState);
  const [inputTab, setInputTab] = useState<InputTab>('manual');
  const [solveStatus, setSolveStatus] = useState<SolveStatus>('idle');
  const [results, setResults] = useState<Partial<Record<SolveMode, SolveResult>>>({});
  // Which solver's result the player shows, once both have run.
  const [shown, setShown] = useState<SolveMode>('fast');
  const [comparing, setComparing] = useState(false);
  const cubeGenRef = useRef(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Defaults to 12 so Optimal mode (cost ~5-8x per extra move) still returns;
  // Fast mode handles any depth.
  const [shuffleDepth, setShuffleDepth] = useState(DEFAULT_SHUFFLE_DEPTH);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<SolveMode>('fast');
  const [solverStatus, setSolverStatus] = useState<SolverStatus>('idle');
  // What a scan corrected on its own. Kept until the next shuffle or solve
  // rather than cleared on edit, so painting a cell does not hide it.
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const [notation, setNotation] = useState('');
  const [notationError, setNotationError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const n = cubeSize(cubeState);
  const shownResult = results[shown];
  const solution = shownResult && 'moves' in shownResult ? shownResult.moves : [];
  const lastSolveMs = shownResult && 'moves' in shownResult ? shownResult.ms : null;

  // Build the two-phase pruning tables straight away. It takes a couple of
  // seconds in a worker, and starting now means it finishes long before the
  // user has finished entering their cube.
  useEffect(() => {
    setSolverStatus(twoPhaseSolver.getStatus());
    const unsubscribe = twoPhaseSolver.onStatusChange(setSolverStatus);
    twoPhaseSolver.warmUp();
    return unsubscribe;
  }, []);

  // Load a shared cube from ?s=<54 colour letters>. Read from window.location
  // rather than useSearchParams, which would need a Suspense boundary.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('s');
    if (!shared) return;
    const state = deserialize(shared);
    if (!state) {
      setValidationErrors(['The shared link does not contain a valid cube.']);
      return;
    }
    setCubeState(state);
    // A 2x2 is checked by its solver instead, which knows when it is unsolvable.
    if (state.length === 24) return;
    const { valid, errors } = validate(state);
    if (!valid) setValidationErrors(errors);
  }, []);

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

  // The notation box describes the current cube only when the cube came from
  // notation or a shuffle; any other change clears it so it never goes stale.
  function handleStateChange(next: CubeState, nextNotation = '') {
    setCubeState(next);
    setNotation(nextNotation);
    setNotationError('');
    setValidationErrors([]);
    // Results belong to one cube. Bumping the generation also drops any solve
    // still in flight for the previous cube when it lands.
    cubeGenRef.current++;
    setResults({});
    if (solveStatus !== 'loading') setSolveStatus('idle');
  }

  // A scan that failed validation still lands here, so it can be fixed by hand.
  function handleScanned(state: CubeState, notes: string[]) {
    handleStateChange(state);
    setValidationErrors(validate(state).errors);
    setScanNotes(notes);
    setInputTab('manual');
  }

  function handleShuffle() {
    const { state, moves } = generateScramble(shuffleDepth, n);
    handleStateChange(state, moves.join(' '));
    setScanNotes([]);
  }

  function handleApplyNotation() {
    const parsed = parseAlgorithm(notation);
    if ('error' in parsed) {
      setNotationError(parsed.error);
      return;
    }
    handleStateChange(parsed.moves.reduce(applyMove, createSolvedState(n)), notation);
    setInputTab('manual');
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/solve?s=${serialize(cubeState)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside secure contexts; nothing useful to show.
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setSolveStatus('idle');
    setLoadingMsgIdx(0);
  }

  // Never throws. Returns null only when the request was cancelled.
  async function solveWith(which: SolveMode): Promise<SolveResult | null> {
    if (which === 'beginner') {
      try {
        const started = performance.now();
        const stages = solveBeginner(cubeState);
        return { moves: stages.flatMap((st) => st.moves), ms: performance.now() - started, stages };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Solver failed' };
      }
    }

    if (which === 'fast') {
      try {
        const { moves, solveMs } = await twoPhaseSolver.solve(cubeState);
        return { moves, ms: solveMs };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Solver failed' };
      }
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
      // An older backend sends no stats; the report panel just stays hidden.
      const stats = (data.stats ?? null) as SearchStats | null;
      if (data.success) {
        return {
          moves: data.moves as string[],
          ms: typeof data.elapsedMs === 'number' ? data.elapsedMs : null,
          stats,
        };
      }
      return { error: data.error ?? 'Solver returned an error', stats };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      return {
        error: navigator.onLine
          ? 'Network error — cannot reach the solver server.'
          : "You're offline. Fast mode still works without a connection.",
      };
    }
  }

  function handleSizeChange(next: CubeSize) {
    if (next === n) return;
    handleStateChange(createSolvedState(next));
    // Camera and upload scanning only know the 3x3 layout.
    if (next === 2 && (inputTab === 'camera' || inputTab === 'upload')) setInputTab('manual');
  }

  // The 2x2 solver is optimal and takes ~150ms in the page, so it skips the
  // fast/optimal split and the backend entirely.
  function handleSolve2x2() {
    const started = performance.now();
    const result = solve2x2(cubeState);
    if ('error' in result) {
      setValidationErrors([result.error]);
      return;
    }
    setValidationErrors([]);
    setResults({ optimal: { moves: result.moves, ms: performance.now() - started } });
    setShown('optimal');
    setSolveStatus('solved');
  }

  async function handleSolve() {
    setScanNotes([]);
    if (n === 2) return handleSolve2x2();
    const { valid, errors } = validate(cubeState);
    if (!valid) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setSolveStatus('loading');
    setLoadingMsgIdx(0);
    setResults({});

    const gen = cubeGenRef.current;
    const result = await solveWith(mode);
    if (!result || gen !== cubeGenRef.current) return;

    setResults({ [mode]: result });
    setShown(mode);
    if ('error' in result) {
      setErrorMsg(result.error);
      setSolveStatus('error');
    } else {
      setSolveStatus('solved');
    }
  }

  // Solve the same cube with the other solver, to put the two side by side.
  async function handleCompare() {
    const other: SolveMode = shown === 'fast' ? 'optimal' : 'fast';
    const gen = cubeGenRef.current;
    setComparing(true);
    const result = await solveWith(other);
    setComparing(false);
    if (!result || gen !== cubeGenRef.current) return;
    setResults((prev) => ({ ...prev, [other]: result }));
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
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-3 py-4 sm:px-6 sm:py-8 flex flex-col lg:flex-row gap-4 sm:gap-8 relative z-10">
        
        {/* Left Col: Input */}
        <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
          <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 shadow-xl shadow-black/20">
            
            {/* Tab bar (wrapping gracefully on narrow screens) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5" role="group" aria-label="Cube size">
                {([3, 2] as CubeSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    disabled={solveStatus === 'loading'}
                    aria-pressed={n === size}
                    className={`px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      n === size
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
              <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
                {((n === 3 ? ['manual', 'notation', 'camera', 'upload'] : ['manual', 'notation']) as InputTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setInputTab(tab)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      inputTab === tab
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {{ manual: 'Manual', notation: 'Notation', camera: 'Camera', upload: 'Upload' }[tab]}
                  </button>
                ))}
              </div>
              
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
                      shuffleDepth >= SLOW_SHUFFLE_DEPTH
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
              {inputTab === 'manual' && <ManualColorPicker state={cubeState} onChange={handleStateChange} />}
              {inputTab === 'notation' && (
                <div className="flex flex-col gap-3">
                  <label htmlFor="notation" className="text-sm text-slate-400">
                    Scramble from a solved cube, in face-turn notation (U L F R B D, with &apos; or 2).
                  </label>
                  <textarea
                    id="notation"
                    value={notation}
                    onChange={(e) => { setNotation(e.target.value); setNotationError(''); }}
                    placeholder="R U R' U' F2 D L2 B'"
                    rows={4}
                    spellCheck={false}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 font-mono text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                  {notationError && (
                    <p role="alert" className="text-sm text-red-400">{notationError}</p>
                  )}
                  <button
                    onClick={handleApplyNotation}
                    className="self-start px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white transition-colors"
                  >
                    Apply scramble
                  </button>
                </div>
              )}
              {inputTab === 'camera' && (
                <WebcamScanner onComplete={handleScanned} onCancel={() => setInputTab('manual')} />
              )}
              {inputTab === 'upload' && <ImageUpload onComplete={handleScanned} />}
            </div>

            {/* Scan auto-corrections */}
            {inputTab === 'manual' && scanNotes.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 sm:p-4 animate-fade-in-up">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Scan auto-corrected
                </div>
                <ul className="text-xs sm:text-sm text-amber-300/80 flex flex-col gap-1.5 ml-6 list-disc marker:text-amber-500/50">
                  {scanNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}

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

                {n === 2 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    2×2 solver, running in your browser. Always finds the shortest solution.
                  </p>
                )}

                {/* ── Fast vs optimal ───────────────────────────────────── */}
                {n === 3 && <div className="flex flex-col gap-1.5">
                  <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setMode('fast')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        mode === 'fast'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Fast
                      <span className="hidden sm:inline font-normal opacity-70"> · ~21 moves</span>
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
                      <span className="hidden sm:inline font-normal opacity-70"> · fewest</span>
                    </button>
                    <button
                      onClick={() => setMode('beginner')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        mode === 'beginner'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Beginner
                      <span className="hidden sm:inline font-normal opacity-70"> · step by step</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {mode === 'beginner' ? (
                      <>Layer by layer, the way people learn to solve it: about 150 moves in seven
                      named stages you can follow on a real cube.</>
                    ) : mode === 'fast' ? (
                      solverStatus === 'ready' ? (
                        <>Two-phase solver, running in your browser. No server, no waiting.</>
                      ) : solverStatus === 'unavailable' ? (
                        <span className="text-amber-400/80">
                          Your browser cannot run the in-page solver. Switch to Optimal.
                        </span>
                      ) : (
                        <>Preparing the in-browser solver…</>
                      )
                    ) : (
                      <>Shortest possible solution from the C++ IDA* server. Cost rises steeply with
                      scramble depth — past {SLOW_SHUFFLE_DEPTH} moves it may time out.</>
                    )}
                  </p>
                </div>}

                <button
                  onClick={handleSolve}
                  disabled={
                    solveStatus === 'loading' ||
                    (n === 3 && mode === 'fast' && solverStatus !== 'ready')
                  }
                  className="btn-shimmer relative w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white text-base sm:text-lg transition-all 
                    shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none overflow-hidden"
                >
                  {solveStatus === 'loading' ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {mode !== 'optimal' ? 'Solving…' : LOADING_MESSAGES[loadingMsgIdx]}
                    </span>
                  ) : n === 3 && mode === 'fast' && solverStatus !== 'ready' ? (
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

                {/* A timed-out optimal search still says how far it got. */}
                {solveStatus === 'error' && shownResult?.stats && (
                  <SearchReport stats={shownResult.stats} />
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
                  <button
                    onClick={handleCopyLink}
                    title="Copy a link to this cube"
                    className="ml-auto mr-2 text-xs font-semibold px-2.5 py-1 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-white/5 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/20">
                    {solution.length === 0 ? '0 moves' : `${solution.length} moves`}
                    {lastSolveMs !== null && (
                      <span className="ml-1.5 font-normal opacity-70">{formatMs(lastSolveMs)}</span>
                    )}
                  </span>
                </div>

                {n === 3 && shown !== 'beginner' && solution.length > 0 && (
                  <CompareStrip
                    results={results}
                    shown={shown}
                    comparing={comparing}
                    canRunFast={solverStatus === 'ready'}
                    onShow={setShown}
                    onCompare={handleCompare}
                  />
                )}

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
                      stages={shownResult && 'moves' in shownResult ? shownResult.stages : undefined}
                    />
                  )}
                </div>

                {shownResult?.stats && <SearchReport stats={shownResult.stats} />}
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
                  Paint your cube state on the left, then click Solve to generate a solution.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MODE_LABEL: Record<SolveMode, string> = { fast: 'Fast', optimal: 'Optimal', beginner: 'Beginner' };

function CompareStrip({ results, shown, comparing, canRunFast, onShow, onCompare }: {
  results: Partial<Record<SolveMode, SolveResult>>;
  shown: SolveMode;
  comparing: boolean;
  canRunFast: boolean;
  onShow: (mode: SolveMode) => void;
  onCompare: () => void;
}) {
  const other: SolveMode = shown === 'fast' ? 'optimal' : 'fast';

  if (!results[other]) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={onCompare}
          disabled={comparing || (other === 'fast' && !canRunFast)}
          className="px-3 py-1.5 font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-md border border-white/5 transition-colors"
        >
          {comparing ? `Solving with ${MODE_LABEL[other]}…` : `Compare with ${MODE_LABEL[other]}`}
        </button>
        {other === 'optimal' && (
          <span className="text-slate-500">Optimal can take up to 50 s on deep scrambles.</span>
        )}
      </div>
    );
  }

  const fast = results.fast;
  const optimal = results.optimal;
  const saved =
    fast && optimal && 'moves' in fast && 'moves' in optimal
      ? fast.moves.length - optimal.moves.length
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        {(['fast', 'optimal'] as SolveMode[]).map((m) => {
          const r = results[m];
          if (!r) return null;
          return (
            <button
              key={m}
              onClick={() => onShow(m)}
              disabled={'error' in r}
              aria-pressed={shown === m}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                shown === m
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-slate-800/50 border-white/5 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="block font-semibold">{MODE_LABEL[m]}</span>
              {'error' in r ? (
                <span className="block text-red-400">{r.error}</span>
              ) : (
                <span className="block opacity-80">
                  {r.moves.length} moves{r.ms !== null && ` · ${formatMs(r.ms)}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {saved !== null && (
        <p className="text-xs text-slate-400">
          {saved > 0
            ? `Optimal saves ${saved} move${saved === 1 ? '' : 's'} over the two-phase solution.`
            : 'Two-phase already found an optimal solution for this cube.'}
        </p>
      )}
    </div>
  );
}

function SearchReport({ stats }: { stats: SearchStats }) {
  const { corner, edge1, edge2 } = stats.h;
  const start = Math.max(corner, edge1, edge2);
  return (
    <details className="text-xs text-slate-400 bg-slate-900/40 border border-white/5 rounded-xl p-3">
      <summary className="cursor-pointer font-semibold text-slate-300">How the search went</summary>
      <div className="flex flex-col gap-3 mt-3">
        <p>
          Starting estimate: the largest of the three pattern databases,
          max(corners {corner}, edges 1-6 {edge1}, edges 7-12 {edge2}) = <b>{start}</b> moves.
          IDA* searches every path up to that bound, then raises the bound until a solution fits.
        </p>
        <table className="w-full font-mono">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-normal">Bound</th>
              <th className="text-right font-normal">Nodes expanded</th>
            </tr>
          </thead>
          <tbody>
            {stats.iterations.map(([bound, nodes]) => (
              <tr key={bound}>
                <td>{bound}</td>
                <td className="text-right">{nodes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {stats.nodes.toLocaleString()} nodes in total. Each extra move of depth multiplies the work, which is why Optimal slows down so sharply.
        </p>
      </div>
    </details>
  );
}
