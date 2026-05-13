'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ManualColorPicker from '@/components/ManualColorPicker';
import SolutionPlayer from '@/components/SolutionPlayer';
import { CubeState, createSolvedState, serialize, validate } from '@/lib/cubeState';

type SolveStatus = 'idle' | 'loading' | 'solved' | 'error';

const LOADING_MESSAGES = [
  'Connecting to solver...',
  'Waking up server...',
  'Loading pattern database...',
  'Solving your cube...',
];

export default function SolvePage() {
  const [cubeState, setCubeState] = useState<CubeState>(createSolvedState);
  const [solveStatus, setSolveStatus] = useState<SolveStatus>('idle');
  const [solution, setSolution] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Ping backend on mount to pre-warm cold start
  useEffect(() => {
    fetch('/api/health-check').catch(() => {});
  }, []);

  // Cycle through loading messages
  useEffect(() => {
    if (solveStatus !== 'loading') return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [solveStatus]);

  function handleStateChange(next: CubeState) {
    setCubeState(next);
    setValidationErrors([]);
    if (solveStatus === 'error') setSolveStatus('idle');
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

    try {
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cubeState: serialize(cubeState) }),
      });
      const data = await res.json();
      if (data.success) {
        setSolution(data.moves as string[]);
        setSolveStatus('solved');
      } else {
        setErrorMsg(data.error ?? 'Solver returned an error');
        setSolveStatus('error');
      }
    } catch {
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
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">Set Cube State</span>
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">Manual</span>
            </div>

            <ManualColorPicker state={cubeState} onChange={handleStateChange} />

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
                {validationErrors.map((e, i) => <span key={i}>• {e}</span>)}
              </div>
            )}

            {/* Solve button */}
            <button
              onClick={handleSolve}
              disabled={solveStatus === 'loading'}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl font-semibold text-base transition-colors"
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

            {solveStatus === 'error' && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300">
                {errorMsg}
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
