'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import RubiksCube3D from './RubiksCube3D';
import ThemeToggle from './ThemeToggle';
import { applyMove, createSolvedState, generateScramble, isSolved, type CubeState } from '@/lib/cubeState';
import { twoPhaseSolver } from '@/lib/twoPhaseSolver';
import { useReducedMotion } from '@/lib/useReducedMotion';

// Two-phase solves any depth in about the same time, so the scramble can be a real one.
const SCRAMBLE_LENGTH = 20;
const MOVE_MS = { scramble: 140, turn: 200, solution: 300 } as const;
const FIRST_SCRAMBLE_DELAY_MS = 600;
// Past this the readout keeps only the latest moves, so it never pushes the button off screen.
const MAX_SHOWN = 36;

/** The moves the readout shows: how the cube got here from solved, or the way back. */
interface Line {
  kind: 'scramble' | 'solution';
  moves: string[];
}

/**
 * The landing page: one full-bleed cube you can turn, and one button that
 * solves it in place with the in-browser two-phase solver.
 */
export default function CubeStage() {
  const reduced = useReducedMotion();
  const [cube, setCube] = useState<CubeState>(createSolvedState);
  const [line, setLine] = useState<Line>({ kind: 'scramble', moves: [] });
  // How many of `line.moves` are already applied to `cube`.
  const [cursor, setCursor] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [moveMs, setMoveMs] = useState<number>(MOVE_MS.scramble);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const pending = cursor < line.moves.length;
  const busy = pending || thinking;
  const solved = isSolved(cube);

  function play(kind: Line['kind'], moves: string[], ms: number) {
    setLine({ kind, moves });
    setCursor(0);
    setMoveMs(ms);
  }

  // Start the table build now so it is done by the time anyone presses Solve,
  // and scramble on arrival: the page's one unprompted motion.
  useEffect(() => {
    twoPhaseSolver.warmUp();
    const t = setTimeout(
      () => play('scramble', generateScramble(SCRAMBLE_LENGTH).moves, MOVE_MS.scramble),
      FIRST_SCRAMBLE_DELAY_MS
    );
    return () => clearTimeout(t);
  }, []);

  // Feed queued moves to the cube one at a time. `move` drops to null between
  // turns so two identical moves in a row still each animate.
  useEffect(() => {
    if (!pending || animating) return;
    if (reduced) {
      setCube((c) => line.moves.slice(cursor).reduce(applyMove, c));
      setCursor(line.moves.length);
      return;
    }
    const t = setTimeout(() => setAnimating(true), 30);
    return () => clearTimeout(t);
  }, [pending, animating, reduced, line, cursor]);

  function onMoveComplete() {
    const m = line.moves[cursor];
    setCube((c) => applyMove(c, m));
    setCursor((i) => i + 1);
    setAnimating(false);
  }

  function onFaceTurn(move: string) {
    if (busy) return;
    setNote(null);
    setMoveMs(MOVE_MS.turn);
    if (line.kind === 'scramble') {
      setLine((l) => ({ ...l, moves: [...l.moves, move] }));
    } else {
      // The cube was just solved, so a turn starts a new scramble from solved.
      setLine({ kind: 'scramble', moves: [move] });
      setCursor(0);
    }
  }

  async function solve() {
    if (busy || solved) return;
    setThinking(true);
    setNote(twoPhaseSolver.getStatus() === 'ready' ? 'Solving' : 'Building the solver tables, about two seconds');
    try {
      const { moves, solveMs } = await twoPhaseSolver.solve(cube);
      play('solution', moves, MOVE_MS.solution);
      setNote(`${moves.length} moves, found in ${Math.round(solveMs)} ms`);
    } catch (e) {
      setNote(e instanceof Error ? `${e.message}. Reload the page to try again.` : 'The solver stopped. Reload the page to try again.');
    } finally {
      setThinking(false);
    }
  }

  function scramble() {
    if (busy) return;
    setNote(null);
    play('scramble', generateScramble(SCRAMBLE_LENGTH).moves, MOVE_MS.scramble);
  }

  const offerScramble = solved && !pending;
  const from = Math.max(0, line.moves.length - MAX_SHOWN);

  return (
    <main className="relative h-[100svh] min-h-[580px] overflow-hidden" onPointerDown={() => setTouched(true)}>
      {/* Text never catches drags; only the cube, links and the button take the pointer. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
        {/* Above the canvas, which in landscape spans the full height behind the nav. */}
        <header className="relative z-10 flex items-center gap-4">
          <Link href="/" className="pointer-events-auto flex items-center gap-3">
            <span aria-hidden className="colorbar h-3 w-9 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1px var(--rule-strong)' }} />
            <span className="mono font-bold text-base sm:text-lg text-fg">Kubrick</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 sm:gap-7 mono text-sm">
            <Link href="/solve" className="pointer-events-auto text-fg underline-offset-4 hover:underline">
              Solve your own cube
            </Link>
            <a
              href="https://github.com/UditUchiha/Rubic_Cube_Solver"
              className="pointer-events-auto hidden sm:inline underline-offset-4 hover:underline hover:text-fg"
              style={{ color: 'var(--muted)' }}
            >
              Source
            </a>
            <span className="pointer-events-auto"><ThemeToggle /></span>
          </nav>
        </header>

        <div className="mt-8 sm:mt-14">
          <h1 className="stage-headline mono font-bold text-fg">Turn it. Kubrick will turn it back.</h1>
          <p className="mt-4 max-w-[34ch] text-sm sm:text-base leading-relaxed" style={{ color: 'var(--muted)' }}>
            Drag a sticker to turn its face. Drag anywhere else to spin the cube.
          </p>
        </div>

        <div className="stage-canvas pointer-events-auto">
          <RubiksCube3D
            fill
            interactive
            zoom={0.95}
            autoRotate={!reduced && !touched}
            autoRotateSpeed={9}
            state={cube}
            move={animating ? line.moves[cursor] : null}
            animDuration={moveMs}
            onMoveComplete={onMoveComplete}
            onFaceTurn={onFaceTurn}
          />
        </div>

        <div className="relative z-10 mt-auto">
          <div className="stage-notation mono" aria-label={line.moves.length ? `${line.kind}: ${line.moves.join(' ')}` : undefined}>
            {line.moves.length > 0 && (
              <>
                <p className="text-xs sm:text-sm mb-2" style={{ color: 'var(--muted)' }}>{line.kind}</p>
                <p className="flex flex-wrap gap-x-[0.55em] gap-y-1 text-fg" aria-hidden>
                  {from > 0 && <span style={{ color: 'var(--muted)' }}>…</span>}
                  {line.moves.slice(from).map((m, i) => {
                    const at = from + i;
                    return (
                      <span
                        key={at}
                        className={clsx(
                          'inline-block min-w-[2ch] px-[0.1em] rounded-[2px] transition-colors',
                          at < cursor && 'opacity-35',
                          at === cursor && pending && 'key-down'
                        )}
                      >
                        {m}
                      </span>
                    );
                  })}
                </p>
              </>
            )}
          </div>

          <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={offerScramble ? scramble : solve}
              disabled={busy}
              aria-busy={thinking}
              className="pointer-events-auto key key-primary min-w-[10ch] px-8 py-3.5 text-base"
            >
              {offerScramble ? 'Scramble' : 'Solve'}
            </button>
            <p aria-live="polite" className="mono text-sm" style={{ color: 'var(--muted)' }}>{note}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
