'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import WebcamScanner from '@/components/WebcamScanner';
import ImageUpload from '@/components/ImageUpload';
import { CubeState, createSolvedState, serialize, validate, generateScramble } from '@/lib/cubeState';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';
type InputTab = 'manual' | 'camera' | 'upload';

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
  const [solution, setSolution] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Ping backend on mount to pre-warm cold start
  useEffect(() => {
    fetch('/api/health-check').catch(() => {});
  }, []);

  // Cycle loading messages; flag slow load after 8 s
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
    const { state } = generateScramble(20);
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
    const { valid, errors } = validate(cubeState);
    if (!valid) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setSolveStatus('loading');
    setLoadingMsgIdx(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cubeState: serialize(cubeState) }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setSolution(data.moves as string[]);
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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold">Rubik&apos;s Cube Solver</h1>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        {/* Left: Input */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="glass rounded-2xl p-6 flex flex-col gap-6">
            {/* Tab bar */}
            <div className="flex items-center gap-2 overflow-x-auto flex-nowrap">
              {(['manual', 'camera', 'upload'] as InputTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInputTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    inputTab === tab
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'manual' ? 'Manual' : tab === 'camera' ? '📷 Camera' : '🖼 Upload'}
                </button>
              ))}
              {inputTab === 'manual' && (
                <button
                  onClick={handleShuffle}
                  disabled={solveStatus === 'loading'}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <span>⇄</span>
                  <span>Shuffle</span>
                </button>
              )}
            </div>

            {inputTab === 'manual' && (
              <ManualColorPicker state={cubeState} onChange={handleStateChange} />
            )}
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

            {/* Validation errors — only shown on manual tab */}
            {inputTab === 'manual' && validationErrors.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
                {validationErrors.map((e, i) => <span key={i}>• {e}</span>)}
              </div>
            )}

            {/* Solve / Cancel buttons — only shown on manual tab */}
            {inputTab === 'manual' && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSolve}
                  disabled={solveStatus === 'loading'}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl font-semibold text-base transition-all"
                >
                  {solveStatus === 'loading' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      {LOADING_MESSAGES[loadingMsgIdx]}
                    </span>
                  ) : (
                    'Solve Cube'
                  )}
                </button>

                {solveStatus === 'loading' && (
                  <button
                    onClick={handleCancel}
                    className="w-full py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {slowLoad && (
                  <p className="text-xs text-center text-gray-500">
                    Server is starting up — this may take up to 30 seconds on first use.
                  </p>
                )}

                {solveStatus === 'error' && (
                  <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300">
                    {errorMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Solution */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="glass rounded-2xl p-6">
            {solveStatus === 'solved' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Solution</span>
                  <span className="text-sm text-gray-400">
                    {solution.length === 0 ? 'Already solved!' : `${solution.length} moves`}
                  </span>
                </div>
                {solution.length === 0 ? (
                  <div className="text-center py-8 text-green-400 text-lg font-semibold">
                    ✓ Cube is already solved!
                  </div>
                ) : (
                  <SolutionPlayer initialState={cubeState} moves={solution} />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-12 text-gray-500">
                <div className="text-4xl">🎲</div>
                <p className="text-center text-sm">
                  Set your cube state using the picker on the left, then click <strong className="text-gray-300">Solve Cube</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
