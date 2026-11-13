'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import Header from '@/components/Header';
import SegmentedControl from '@/components/SegmentedControl';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import WebcamScanner from '@/components/WebcamScanner';
import ImageUpload from '@/components/ImageUpload';
import { Color, CubeState, serialize, deserialize, parseAlgorithm } from '@/lib/cubeState';
import { solveBeginner, Stage } from '@/lib/beginnerSolver';
import RubiksCube3D from '@/components/RubiksCube3D';
import type { SolverStatus } from '@/lib/browserSolver';
import { PUZZLES, getPuzzle } from '@/lib/puzzles';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';
type InputTab = 'manual' | 'notation' | 'camera' | 'upload';
// 'fast' is Instant (cubejs in the browser); 'fast-cpp' is this project's own
// two-phase in C++ on the backend.
type SolveMode = 'fast' | 'fast-cpp' | 'optimal' | 'beginner';
const usesBackend = (m: SolveMode) => m === 'optimal' || m === 'fast-cpp';

// What each solver is and what it is built on, shown under the picker and in
// "How these solvers work".
const SOLVERS: Record<SolveMode, { label: string; blurb: string; runs: string; result: string; how: string }> = {
  fast: {
    label: 'Instant',
    blurb: "Kociemba's two-phase algorithm from the open-source cubejs library, running in your browser. No server, works offline.",
    runs: 'Your browser (Web Worker)',
    result: '~21 moves in ~0.1 s, any scramble',
    how: 'Phase 1 searches until the cube only needs U, D and half turns of the other faces; phase 2 finishes it using just those moves. Splitting it in two keeps each search small enough to be near-instant.',
  },
  'fast-cpp': {
    label: 'Fast',
    blurb: 'The same two-phase algorithm, written from scratch in C++ for this project and run on the server.',
    runs: 'C++ on the server',
    result: '~22 moves; ~35 ms of search plus the network trip',
    how: "Same two phases as Instant, but every table and search is this project's own C++, built on the same cube model as the Optimal solver. Every solution is replayed on that model before it is sent.",
  },
  optimal: {
    label: 'Optimal',
    blurb: "Korf's IDA* search in C++ on the server: provably the fewest moves. Slows down steeply on deep scrambles.",
    runs: 'C++ on the server, all CPU cores',
    result: 'Fewest possible moves (at most 20); seconds to minutes',
    how: 'Iterative-deepening A*: a depth-first search whose move budget grows by one each round. Three precomputed pattern databases (88M corner states, 2 x 42.6M edge states) give a lower bound on the moves left, so hopeless branches are cut early.',
  },
  beginner: {
    label: 'Beginner',
    blurb: 'Layer by layer, the way people learn to solve it: about 150 moves in seven named stages you can follow on a real cube.',
    runs: 'Your browser',
    result: '~150 moves, split into stages',
    how: 'White cross, white corners, middle layer, then the yellow side in four steps (cross, edges, corner positions, corner twists), each with a few memorable algorithms. Long, but every stage is something a person can learn.',
  },
};

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
const MAX_SHUFFLE_DEPTH = 25;
// Depth past which the *optimal* backend gets slow. Fast mode does not care.
const SLOW_SHUFFLE_DEPTH = 13;

const LOADING_MESSAGES = [
  'connecting to solver',
  'waking up server',
  'loading pattern database',
  'solving',
];

/** One engraved row of the readout table. */
function Readout({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`grid grid-cols-[8ch_1fr] gap-3 px-4 py-2.5 sm:px-5 ${last ? '' : 'rule-b'}`}>
      <dt style={{ color: 'var(--muted)' }}>{label}</dt>
      <dd className="text-fg min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** A labelled control row inside the input panel. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="mono text-xs w-[8ch]" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
    </div>
  );
}

export default function SolvePage({ puzzleId }: { puzzleId: string }) {
  const puzzle = getPuzzle(puzzleId)!;
  const [cubeState, setCubeState] = useState<CubeState>(puzzle.createSolvedState);
  const [activeColor, setActiveColor] = useState<Color>(2); // Red
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
  const [shuffleDepth, setShuffleDepth] = useState(puzzle.defaultScrambleDepth);
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
  // A layer being turned by dragging a sticker on the 3D preview; applied to
  // the state once the animation finishes.
  const [turning, setTurning] = useState<string | null>(null);

  const n = puzzle.layers;
  const shownResult = results[shown];
  const solution = shownResult && 'moves' in shownResult ? shownResult.moves : [];
  const lastSolveMs = shownResult && 'moves' in shownResult ? shownResult.ms : null;

  // Build the in-browser solver's tables straight away. It takes a couple of
  // seconds in a worker, and starting now means it finishes long before the
  // user has finished entering their cube.
  useEffect(() => {
    const { solver } = puzzle;
    setSolverStatus(solver.getStatus());
    const unsubscribe = solver.onStatusChange(setSolverStatus);
    solver.warmUp();
    return unsubscribe;
  }, [puzzle]);

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
    if (state.length !== 6 * puzzle.layers * puzzle.layers) {
      setValidationErrors([`The shared link is not a ${puzzle.name} cube.`]);
      return;
    }
    setCubeState(state);
    const { valid, errors } = puzzle.validate(state);
    if (!valid) setValidationErrors(errors);
  }, [puzzle]);

  // Only wake the optimal backend if the user actually wants it - on a free
  // tier it sleeps after 15 minutes and takes about a minute to come back.
  useEffect(() => {
    if (!usesBackend(mode)) return;
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

  function finishTurn() {
    if (!turning) return;
    const next = puzzle.applyMove(cubeState, turning);
    setTurning(null);
    handleStateChange(next);
  }

  // Painting on the 3D preview; same rules as the flat net (3x3 centres are fixed).
  function paintSticker(index: number) {
    if (n === 3 && index % 9 === 4) return;
    const next = [...cubeState];
    next[index] = activeColor;
    handleStateChange(next);
  }

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
    setValidationErrors(puzzle.validate(state).errors);
    setScanNotes(notes);
    setInputTab('manual');
  }

  function handleShuffle() {
    const { state, moves } = puzzle.generateScramble(shuffleDepth);
    handleStateChange(state, moves.join(' '));
    setScanNotes([]);
  }

  function handleApplyNotation() {
    const parsed = parseAlgorithm(notation);
    if ('error' in parsed) {
      setNotationError(parsed.error);
      return;
    }
    handleStateChange(parsed.moves.reduce(puzzle.applyMove, puzzle.createSolvedState()), notation);
    setInputTab('manual');
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/solve/${puzzle.id}?s=${serialize(cubeState)}`);
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
        const { moves, solveMs } = await puzzle.solver.solve(cubeState);
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
        body: JSON.stringify({ cubeState: serialize(cubeState), mode: which === 'fast-cpp' ? 'fast' : 'optimal' }),
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
          : "You're offline. Instant and Beginner still work without a connection.",
      };
    }
  }

  async function handleSolve() {
    setScanNotes([]);
    const { valid, errors } = puzzle.validate(cubeState);
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
    const other = compareTarget(shown, results);
    const gen = cubeGenRef.current;
    setComparing(true);
    const result = await solveWith(other);
    setComparing(false);
    if (!result || gen !== cubeGenRef.current) return;
    setResults((prev) => ({ ...prev, [other]: result }));
  }

  const validity = validationErrors.length > 0 ? `invalid, ${validationErrors.length} ${validationErrors.length === 1 ? 'problem' : 'problems'}` : 'valid';
  const tables = solverStatus === 'ready' ? 'ready' : solverStatus === 'unavailable' ? 'unavailable' : 'building';
  const busy = solveStatus === 'loading';
  // Dragging a sticker turns a layer; only wired for the 3x3 the drag maths covers.
  const canTurn = n === 3 && inputTab === 'manual' && !busy;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <h1 className="sr-only">Solve your cube</h1>

      <div className="flex-1 max-w-6xl mx-auto w-full px-3 py-4 sm:px-6 sm:py-8 grid gap-4 sm:gap-6 lg:grid-cols-2 items-start">

        {/* ── Input panel ─────────────────────────────────────────────────── */}
        {/* min-w-0: otherwise the grid item takes the cube net's intrinsic width
            and the net measures itself against that, never shrinking on phones. */}
        <section className="bezel flex flex-col min-w-0" aria-label="Cube input">
          <div className="rule-b px-4 py-3 sm:px-5 flex flex-col gap-3">
            <Row label="puzzle">
              <nav aria-label="Puzzle" className="flex gap-1">
                {PUZZLES.map((p) => (
                  <Link
                    key={p.id}
                    href={`/solve/${p.id}`}
                    aria-current={p.id === puzzle.id ? 'page' : undefined}
                    className={clsx('key px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm', p.id === puzzle.id && 'key-down')}
                  >
                    {p.name}
                  </Link>
                ))}
              </nav>
            </Row>
            <Row label="input">
              <SegmentedControl
                label="Input method"
                value={inputTab}
                onChange={setInputTab}
                options={[
                  { value: 'manual' as InputTab, label: 'paint' },
                  { value: 'notation' as InputTab, label: 'notation' },
                  ...(puzzle.scan ? [
                    { value: 'camera' as InputTab, label: 'camera' },
                    { value: 'upload' as InputTab, label: 'photos' },
                  ] : []),
                ]}
              />
            </Row>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5 min-h-[300px]">
            {inputTab === 'manual' && (
              <ManualColorPicker
                state={cubeState}
                onChange={handleStateChange}
                activeColor={activeColor}
                onActiveColorChange={setActiveColor}
              />
            )}
            {inputTab === 'notation' && (
              <div className="flex flex-col gap-3">
                <label htmlFor="notation" className="text-sm" style={{ color: 'var(--muted)' }}>
                  Scramble from a solved cube, in face-turn notation (U L F R B D, with &apos; or 2).
                </label>
                <textarea
                  id="notation"
                  value={notation}
                  onChange={(e) => { setNotation(e.target.value); setNotationError(''); }}
                  placeholder="R U R' U' F2 D L2 B'"
                  rows={4}
                  spellCheck={false}
                  className="key w-full p-3 font-mono text-sm text-left"
                />
                {notationError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">{notationError}</p>
                )}
                <button onClick={handleApplyNotation} className="key self-start px-4 py-2 text-sm">
                  Apply scramble
                </button>
              </div>
            )}
            {inputTab === 'camera' && (
              <WebcamScanner onComplete={handleScanned} onCancel={() => setInputTab('manual')} />
            )}
            {inputTab === 'upload' && <ImageUpload onComplete={handleScanned} />}
          </div>

          {inputTab === 'manual' && scanNotes.length > 0 && (
            <div className="rule-t px-4 py-3 sm:px-5 text-sm">
              <p className="mono text-xs mb-1.5 text-amber-700 dark:text-amber-400">scan corrected</p>
              <ul className="flex flex-col gap-1 list-disc ml-5">
                {scanNotes.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            </div>
          )}

          {inputTab === 'manual' && validationErrors.length > 0 && (
            <div className="rule-t px-4 py-3 sm:px-5 text-sm" role="alert">
              <p className="mono text-xs mb-1.5 text-red-600 dark:text-red-400">this cube cannot exist</p>
              <ul className="flex flex-col gap-1 list-disc ml-5">
                {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {inputTab === 'manual' && (
            <div className="rule-t px-4 py-4 sm:px-5 flex flex-col gap-3">
              <Row label="scramble">
                <label htmlFor="shuffle-depth" className="sr-only">Scramble depth</label>
                <input
                  id="shuffle-depth"
                  type="number"
                  min={1}
                  max={MAX_SHUFFLE_DEPTH}
                  value={shuffleDepth}
                  onChange={(e) =>
                    setShuffleDepth(Math.max(1, Math.min(MAX_SHUFFLE_DEPTH, Number(e.target.value) || 1)))
                  }
                  disabled={busy}
                  className="key w-14 py-1.5 text-center text-sm
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="mono text-xs" style={{ color: 'var(--muted)' }}>moves</span>
                <button
                  onClick={handleShuffle}
                  disabled={busy}
                  title={shuffleDepth >= SLOW_SHUFFLE_DEPTH ? `Depth ${shuffleDepth} can take 10-30 s in Optimal mode` : `Scramble ${shuffleDepth} moves`}
                  className="key px-3 py-1.5 text-xs sm:text-sm"
                >
                  Scramble
                </button>
              </Row>

              {!puzzle.optimalBackend && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{puzzle.solverBlurb}</p>
              )}

              {puzzle.optimalBackend && (
                <>
                  <Row label="solver">
                    <SegmentedControl
                      label="Solver"
                      value={mode}
                      onChange={setMode}
                      disabled={busy}
                      options={(['fast', 'fast-cpp', 'optimal', 'beginner'] as SolveMode[]).map((m) => ({ value: m, label: SOLVERS[m].label.toLowerCase() }))}
                    />
                  </Row>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {mode === 'fast' && solverStatus === 'unavailable' ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Your browser cannot run the in-page solver. Switch to Fast or Optimal.
                      </span>
                    ) : mode === 'fast' && solverStatus !== 'ready' ? (
                      <>Preparing the in-browser solver…</>
                    ) : (
                      <>
                        {SOLVERS[mode].blurb}
                        {mode === 'optimal' && ` Past ${SLOW_SHUFFLE_DEPTH} scramble moves it may time out.`}
                      </>
                    )}
                  </p>
                  <SolverGuide />
                </>
              )}

              <button
                onClick={handleSolve}
                disabled={busy || (mode === 'fast' && solverStatus !== 'ready')}
                className="key key-primary w-full py-3 text-sm sm:text-base mt-1"
              >
                {busy
                  ? (usesBackend(mode) ? LOADING_MESSAGES[loadingMsgIdx] : 'solving')
                  : mode === 'fast' && solverStatus !== 'ready'
                  ? 'preparing solver'
                  : 'Solve'}
              </button>

              {busy && usesBackend(mode) && (
                <button onClick={handleCancel} className="key w-full py-2 text-sm">
                  Cancel
                </button>
              )}

              {slowLoad && usesBackend(mode) && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  The server is waking up. The first request can take up to 45 s.
                </p>
              )}

              {solveStatus === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errorMsg}</p>
              )}

              {/* A timed-out optimal search still says how far it got. */}
              {solveStatus === 'error' && shownResult?.stats && (
                <SearchReport stats={shownResult.stats} />
              )}
            </div>
          )}
        </section>

        {/* ── Cube and readouts ───────────────────────────────────────────── */}
        <section className="bezel flex flex-col min-w-0" aria-label="Cube and solution">
          {solveStatus === 'solved' ? (
            <>
              <div className="rule-b px-4 py-3 sm:px-5 mono text-xs flex flex-wrap items-center gap-x-4 gap-y-2">
                <span style={{ color: 'var(--muted)' }}>solution</span>
                {solution.length === 0 && <span>already solved, nothing to do</span>}
                <button onClick={handleCopyLink} title="Copy a link to this cube" className="key ml-auto px-2.5 py-1 text-xs">
                  {copied ? 'copied' : 'copy link'}
                </button>
              </div>
              <div className="px-4 py-4 sm:px-5 sm:py-5 flex flex-col gap-4">
                {puzzle.optimalBackend && shown !== 'beginner' && solution.length > 0 && (
                  <CompareStrip
                    results={results}
                    shown={shown}
                    comparing={comparing}
                    canRunFast={solverStatus === 'ready'}
                    onShow={setShown}
                    onCompare={handleCompare}
                  />
                )}
                {solution.length === 0 ? (
                  <div className="h-[280px] sm:h-[360px]">
                    <RubiksCube3D fill interactive state={cubeState} />
                  </div>
                ) : (
                  <SolutionPlayer
                    initialState={cubeState}
                    moves={solution}
                    stages={shownResult && 'moves' in shownResult ? shownResult.stages : undefined}
                  />
                )}
                {shownResult?.stats && <SearchReport stats={shownResult.stats} />}
              </div>
            </>
          ) : (
            <>
              <div className="rule-b px-4 py-3 sm:px-5 mono text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                <span style={{ color: 'var(--muted)' }}>your cube</span>
                <span>{inputTab === 'manual' ? (n === 3 ? 'drag a sticker to turn its layer, click to paint' : 'click a sticker to paint') : 'drag to orbit'}</span>
              </div>
              <div className={`h-[280px] sm:h-[360px] ${busy ? 'opacity-50' : ''}`}>
                <RubiksCube3D
                  fill
                  interactive
                  state={cubeState}
                  move={turning}
                  animDuration={250}
                  onMoveComplete={finishTurn}
                  onStickerClick={inputTab === 'manual' && !busy ? paintSticker : undefined}
                  onFaceTurn={canTurn ? (m) => { if (!turning) setTurning(m); } : undefined}
                />
              </div>
            </>
          )}

          <dl className="rule-t mono text-sm">
            <Readout label="mode">{puzzle.optimalBackend ? `${SOLVERS[mode].label.toLowerCase()}, ${SOLVERS[mode].runs.toLowerCase()}` : puzzle.name}</Readout>
            <Readout label="tables">{tables}</Readout>
            <Readout label="cube">{validity}</Readout>
            <Readout label="moves">{solveStatus === 'solved' ? solution.length : busy ? (usesBackend(mode) ? LOADING_MESSAGES[loadingMsgIdx] : 'solving') : '—'}</Readout>
            <Readout label="time" last>{solveStatus === 'solved' && lastSolveMs !== null ? formatMs(lastSolveMs) : '—'}</Readout>
          </dl>
        </section>
      </div>
    </div>
  );
}

// Optimal is compared against whichever quick solver ran; anything else
// against Optimal.
function compareTarget(shown: SolveMode, results: Partial<Record<SolveMode, SolveResult>>): SolveMode {
  if (shown !== 'optimal') return 'optimal';
  return results['fast-cpp'] && !results.fast ? 'fast-cpp' : 'fast';
}

function SolverGuide() {
  return (
    <details className="text-[11px] text-slate-400 bezel px-3 py-2">
      <summary className="cursor-pointer font-semibold text-slate-300 select-none">How these solvers work</summary>
      <dl className="mt-2 flex flex-col gap-3">
        {(['fast', 'fast-cpp', 'optimal', 'beginner'] as SolveMode[]).map((m) => (
          <div key={m}>
            <dt className="font-semibold text-fg">{SOLVERS[m].label}</dt>
            <dd className="leading-relaxed">{SOLVERS[m].how}</dd>
            <dd className="text-slate-500">{SOLVERS[m].runs} · {SOLVERS[m].result}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function CompareStrip({ results, shown, comparing, canRunFast, onShow, onCompare }: {
  results: Partial<Record<SolveMode, SolveResult>>;
  shown: SolveMode;
  comparing: boolean;
  canRunFast: boolean;
  onShow: (mode: SolveMode) => void;
  onCompare: () => void;
}) {
  const other = compareTarget(shown, results);

  if (!results[other]) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={onCompare}
          disabled={comparing || (other === 'fast' && !canRunFast)}
          className="key px-3 py-1.5"
        >
          {comparing ? `Solving with ${SOLVERS[other].label}…` : `Compare with ${SOLVERS[other].label}`}
        </button>
        {other === 'optimal' && (
          <span className="text-slate-500">Optimal can take up to 50 s on deep scrambles.</span>
        )}
      </div>
    );
  }

  const shownModes = (['fast', 'fast-cpp', 'optimal'] as SolveMode[]).filter((m) => results[m]);
  const quick = shownModes.find((m) => m !== 'optimal');
  const quickResult = quick && results[quick];
  const optimal = results.optimal;
  const saved =
    quick && quickResult && optimal && 'moves' in quickResult && 'moves' in optimal
      ? quickResult.moves.length - optimal.moves.length
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`grid gap-2 ${shownModes.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {shownModes.map((m) => {
          const r = results[m];
          if (!r) return null;
          return (
            <button
              key={m}
              onClick={() => onShow(m)}
              disabled={'error' in r}
              aria-pressed={shown === m}
              className={`key text-left px-3 py-2 text-xs ${
                shown === m ? 'key-down' : ''
              }`}
            >
              <span className="block font-semibold">{SOLVERS[m].label}</span>
              {'error' in r ? (
                <span className="block text-red-600 dark:text-red-400">{r.error}</span>
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
            ? `Optimal saves ${saved} move${saved === 1 ? '' : 's'} over ${SOLVERS[quick!].label}.`
            : `${SOLVERS[quick!].label} already found an optimal solution for this cube.`}
        </p>
      )}
    </div>
  );
}

function SearchReport({ stats }: { stats: SearchStats }) {
  const { corner, edge1, edge2 } = stats.h;
  const start = Math.max(corner, edge1, edge2);
  return (
    <details className="text-xs text-slate-400 bezel p-3">
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
