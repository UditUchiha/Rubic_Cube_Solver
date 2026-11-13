'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import SegmentedControl from '@/components/SegmentedControl';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import WebcamScanner from '@/components/WebcamScanner';
import ImageUpload from '@/components/ImageUpload';
import RubiksCube3D from '@/components/RubiksCube3D';
import { Color, CubeState, Face, applyMove, createSolvedState, serialize, setCell, validate, generateScramble } from '@/lib/cubeState';
import { twoPhaseSolver, SolverStatus } from '@/lib/twoPhaseSolver';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';
type InputTab = 'manual' | 'camera' | 'upload';
type SolveMode = 'fast' | 'optimal';

// Scramble length is not solution length: any cube is at most 20 moves from
// solved (God's number) however long the scramble, so 25 costs nothing - a
// random-move scramble that long just lands on a typical ~18-move-deep state.
const DEFAULT_SHUFFLE_DEPTH = 12;
const MAX_SHUFFLE_DEPTH = 25;
// Depth past which the *optimal* backend gets slow. Fast mode does not care.
const SLOW_SHUFFLE_DEPTH = 13;

const LOADING_MESSAGES = [
  'connecting to solver',
  'waking up server',
  'loading pattern database',
  'solving',
];

const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

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

export default function SolvePage() {
  const [cubeState, setCubeState] = useState<CubeState>(createSolvedState);
  const [activeColor, setActiveColor] = useState<Color>(2); // Red
  const [inputTab, setInputTab] = useState<InputTab>('manual');
  const [solveStatus, setSolveStatus] = useState<SolveStatus>('idle');
  const [solution, setSolution] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Defaults to 12 so Optimal mode (cost ~5-8x per extra move) still returns;
  // Fast mode handles any depth.
  const [shuffleDepth, setShuffleDepth] = useState(DEFAULT_SHUFFLE_DEPTH);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<SolveMode>('fast');
  const [solverStatus, setSolverStatus] = useState<SolverStatus>('idle');
  const [lastSolveMs, setLastSolveMs] = useState<number | null>(null);
  // What a scan corrected on its own. Kept until the next shuffle or solve
  // rather than cleared on edit, so painting a cell does not hide it.
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Build the two-phase pruning tables straight away. It takes a couple of
  // seconds in a worker, and starting now means it finishes long before the
  // user has finished entering their cube.
  useEffect(() => {
    setSolverStatus(twoPhaseSolver.getStatus());
    const unsubscribe = twoPhaseSolver.onStatusChange(setSolverStatus);
    twoPhaseSolver.warmUp();
    return unsubscribe;
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

  // Painting on the 3D preview; same rules as the flat net (centres are fixed).
  function paintSticker(index: number) {
    if (index % 9 === 4) return;
    handleStateChange(setCell(cubeState, Math.floor(index / 9) as Face, Math.floor((index % 9) / 3), index % 3, activeColor));
  }

  // A layer turn dragged on the 3D preview: animate it, then apply it.
  const [turning, setTurning] = useState<string | null>(null);
  function finishTurn() {
    if (!turning) return;
    const next = applyMove(cubeState, turning);
    setTurning(null);
    handleStateChange(next);
  }

  function handleStateChange(next: CubeState) {
    setCubeState(next);
    setValidationErrors([]);
    if (solveStatus === 'error') setSolveStatus('idle');
  }

  // A scan that failed validation still lands here, so it can be fixed by hand.
  function handleScanned(state: CubeState, notes: string[]) {
    handleStateChange(state);
    setValidationErrors(validate(state).errors);
    setScanNotes(notes);
    setInputTab('manual');
  }

  function handleShuffle() {
    const { state } = generateScramble(shuffleDepth);
    handleStateChange(state);
    setScanNotes([]);
    setSolveStatus('idle');
    setSolution([]);
  }

  function handleCancel() {
    abortRef.current?.abort();
    setSolveStatus('idle');
    setLoadingMsgIdx(0);
  }

  async function handleSolve() {
    setScanNotes([]);
    const { valid, errors } = validate(cubeState);
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
        const { moves, solveMs } = await twoPhaseSolver.solve(cubeState);
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
      setErrorMsg('Cannot reach the solver server. Check your connection, or use Fast mode.');
      setSolveStatus('error');
    }
  }

  const validity = validationErrors.length > 0 ? `invalid, ${validationErrors.length} ${validationErrors.length === 1 ? 'problem' : 'problems'}` : 'valid';
  const tables = solverStatus === 'ready' ? 'ready' : solverStatus === 'unavailable' ? 'unavailable' : 'building';
  const busy = solveStatus === 'loading';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <h1 className="sr-only">Solve your cube</h1>

      <div className="flex-1 max-w-6xl mx-auto w-full px-3 py-4 sm:px-6 sm:py-8 grid gap-4 sm:gap-6 lg:grid-cols-2 items-start">

        {/* ── Input panel ─────────────────────────────────────────────────── */}
        {/* min-w-0: otherwise the grid item takes the cube net's intrinsic width
            and the net measures itself against that, never shrinking on phones. */}
        <section className="bezel flex flex-col min-w-0" aria-label="Cube input">
          <div className="rule-b px-4 py-3 sm:px-5 flex flex-wrap items-center gap-3">
            <span className="mono text-xs w-[8ch]" style={{ color: 'var(--muted)' }}>input</span>
            <SegmentedControl
              label="Input method"
              value={inputTab}
              onChange={setInputTab}
              options={[
                { value: 'manual', label: 'paint' },
                { value: 'camera', label: 'camera' },
                { value: 'upload', label: 'photos' },
              ]}
            />
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
            {inputTab === 'camera' && (
              <WebcamScanner onComplete={handleScanned} onCancel={() => setInputTab('manual')} />
            )}
            {inputTab === 'upload' && <ImageUpload onComplete={handleScanned} />}
          </div>

          {inputTab === 'manual' && scanNotes.length > 0 && (
            <div className="rule-t px-4 py-3 sm:px-5 text-sm">
              <p className="mono text-xs mb-1.5 text-amber-700 dark:text-amber-400">scan corrected</p>
              <ul className="flex flex-col gap-1 list-disc ml-5">
                {scanNotes.map((n, i) => <li key={i}>{n}</li>)}
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

              <Row label="solver">
                <SegmentedControl
                  label="Solver"
                  value={mode}
                  onChange={setMode}
                  disabled={busy}
                  options={[
                    { value: 'fast', label: 'fast' },
                    { value: 'optimal', label: 'optimal' },
                  ]}
                />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {mode === 'fast'
                    ? 'about 21 moves, in your browser'
                    : `fewest moves, on the server; slow past ${SLOW_SHUFFLE_DEPTH} scramble moves`}
                </span>
              </Row>

              {mode === 'fast' && solverStatus === 'unavailable' && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Your browser cannot run the in-page solver. Switch to Optimal.
                </p>
              )}

              <button
                onClick={handleSolve}
                disabled={busy || (mode === 'fast' && solverStatus !== 'ready')}
                className="key key-primary w-full py-3 text-sm sm:text-base mt-1"
              >
                {busy
                  ? (mode === 'fast' ? 'solving' : LOADING_MESSAGES[loadingMsgIdx])
                  : mode === 'fast' && solverStatus !== 'ready'
                  ? 'preparing solver'
                  : 'Solve'}
              </button>

              {busy && mode === 'optimal' && (
                <button onClick={handleCancel} className="key w-full py-2 text-sm">
                  Cancel
                </button>
              )}

              {slowLoad && mode === 'optimal' && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  The server is waking up. The first request can take up to 45 s.
                </p>
              )}

              {solveStatus === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errorMsg}</p>
              )}
            </div>
          )}
        </section>

        {/* ── Cube and readouts ───────────────────────────────────────────── */}
        <section className="bezel flex flex-col min-w-0" aria-label="Cube and solution">
          {solveStatus === 'solved' ? (
            <>
              <div className="rule-b px-4 py-3 sm:px-5 mono text-xs flex items-center gap-4">
                <span style={{ color: 'var(--muted)' }}>solution</span>
                {solution.length === 0 && <span>already solved, nothing to do</span>}
              </div>
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                {solution.length === 0 ? (
                  <div className="h-[280px] sm:h-[360px]">
                    <RubiksCube3D fill interactive state={cubeState} />
                  </div>
                ) : (
                  <SolutionPlayer initialState={cubeState} moves={solution} />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rule-b px-4 py-3 sm:px-5 mono text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                <span style={{ color: 'var(--muted)' }}>your cube</span>
                <span>{inputTab === 'manual' ? 'drag a sticker to turn its layer, click to paint' : 'drag to orbit'}</span>
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
                  onFaceTurn={inputTab === 'manual' && !busy ? (m) => { if (!turning) setTurning(m); } : undefined}
                />
              </div>
            </>
          )}

          <dl className="rule-t mono text-sm">
            <Readout label="mode">{mode === 'fast' ? 'fast, two-phase in a Web Worker' : "optimal, Korf's IDA* in C++"}</Readout>
            <Readout label="tables">{tables}</Readout>
            <Readout label="cube">{validity}</Readout>
            <Readout label="moves">{solveStatus === 'solved' ? solution.length : busy ? LOADING_MESSAGES[mode === 'fast' ? 3 : loadingMsgIdx] : '—'}</Readout>
            <Readout label="time" last>{lastSolveMs !== null ? formatMs(lastSolveMs) : '—'}</Readout>
          </dl>
        </section>
      </div>
    </div>
  );
}
