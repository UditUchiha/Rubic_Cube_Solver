'use client';

import {
  Color, Face, CubeState, COLOR_HEX, COLOR_NAMES, FACE_NAMES,
  setCell, createSolvedState,
} from '@/lib/cubeState';
import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';

interface Props {
  state: CubeState;
  onChange: (state: CubeState) => void;
  /** Lifted to the parent so the 3D preview paints with the same colour. */
  activeColor: Color;
  onActiveColorChange: (color: Color) => void;
}

const PALETTE: Color[] = [0, 1, 2, 3, 4, 5];

// Cross layout: [face, gridRow, gridCol] (1-indexed CSS grid)
const FACE_POSITIONS: [Face, number, number][] = [
  [0, 1, 2], // UP
  [1, 2, 1], // LEFT
  [2, 2, 2], // FRONT
  [3, 2, 3], // RIGHT
  [4, 2, 4], // BACK
  [5, 3, 2], // DOWN
];

// Minimum cell size in px so the cube is always usable
const MIN_CELL = 24;
const MAX_CELL = 40;

export default function ManualColorPicker({ state, onChange, activeColor, onActiveColorChange }: Props) {
  const [cellSize, setCellSize] = useState(36);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute cell size so the 4-wide cross fits the container width
  const computeSize = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    // 4 faces wide, each 3 cells + 2 gaps (2px), plus 3 gaps between faces (4px)
    // total_width = 4*(3*cs + 2*gap) + 3*faceGap
    // Solve for cs: cs = (w - 3*4 - 4*2*2) / 12
    const faceGap = 4;
    const cellGap = 2;
    const cs = Math.floor((w - 3 * faceGap - 4 * cellGap * 2) / 12);
    setCellSize(Math.max(MIN_CELL, Math.min(MAX_CELL, cs)));
  }, []);

  useEffect(() => {
    computeSize();
    const ro = new ResizeObserver(computeSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [computeSize]);

  function handleCellClick(face: Face, row: number, col: number) {
    if (row === 1 && col === 1) return; // center locked
    onChange(setCell(state, face, row, col, activeColor));
  }

  function handleReset() {
    onChange(createSolvedState());
  }

  const gap = Math.max(2, Math.floor(cellSize / 14));
  const faceSize = cellSize * 3 + gap * 2;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Color palette ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Paint:</span>
        {PALETTE.map((color) => (
          <button
            key={color}
            id={`color-swatch-${color}`}
            onClick={() => onActiveColorChange(color)}
            aria-label={`Select ${COLOR_NAMES[color]}`}
            aria-pressed={activeColor === color}
            className={clsx(
              'rounded-full border-2 transition-all duration-200 flex-shrink-0',
              activeColor === color
                ? 'scale-125 border-fg shadow-lg'
                : 'border-slate-600 hover:border-slate-300 hover:scale-110'
            )}
            style={{
              width: 28, height: 28,
              backgroundColor: COLOR_HEX[color],
              boxShadow: activeColor === color
                ? `0 0 0 3px rgba(255,255,255,0.15), 0 0 12px ${COLOR_HEX[color]}80`
                : undefined,
            }}
            title={COLOR_NAMES[color]}
          />
        ))}

        {/* Active color name label */}
        <span className="ml-1 text-xs text-slate-300 font-medium min-w-[48px]">
          {COLOR_NAMES[activeColor]}
        </span>

        {/* Reset button */}
        <button
          id="reset-cube-btn"
          onClick={handleReset}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-fg
            transition-all duration-200 active:scale-95"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Reset
        </button>
      </div>

      {/* ── Cube net (cross layout) ──────────────────────────────────────── */}
      <div ref={containerRef} className="w-full overflow-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(4, ${faceSize}px)`,
            gridTemplateRows:    `repeat(3, auto)`,
            gap: '4px',
          }}
        >
          {FACE_POSITIONS.map(([face, gridRow, gridCol]) => (
            <div
              key={face}
              style={{ gridRow, gridColumn: gridCol }}
            >
              {/* Face label */}
              <div
                className="text-center font-medium text-slate-500 mb-1 select-none"
                style={{ fontSize: Math.max(9, cellSize * 0.28), lineHeight: '1.2' }}
              >
                {FACE_NAMES[face]}
              </div>

              {/* 3×3 grid of cells */}
              <div
                className="grid rounded"
                style={{
                  gridTemplateColumns: `repeat(3, ${cellSize}px)`,
                  gap: `${gap}px`,
                  padding: `${gap}px`,
                  background: '#0d0d18',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 6,
                }}
              >
                {Array.from({ length: 9 }, (_, i) => {
                  const row = Math.floor(i / 3);
                  const col = i % 3;
                  const isCenter = row === 1 && col === 1;
                  const color = state[face * 9 + i];
                  return (
                    <button
                      key={i}
                      id={`cell-f${face}-r${row}-c${col}`}
                      onClick={() => handleCellClick(face, row, col)}
                      disabled={isCenter}
                      aria-label={isCenter ? `${FACE_NAMES[face]} center (fixed)` : `${FACE_NAMES[face]} row ${row} col ${col}`}
                      className={clsx(
                        'rounded transition-all duration-150',
                        isCenter
                          ? 'cursor-default opacity-85 ring-1 ring-white/20'
                          : 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-white/60 active:scale-95'
                      )}
                      style={{
                        width:           cellSize,
                        height:          cellSize,
                        backgroundColor: COLOR_HEX[color],
                        boxShadow:       isCenter
                          ? 'inset 0 0 0 1.5px rgba(0,0,0,0.4)'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.3)',
                        borderRadius:    Math.max(3, cellSize * 0.1),
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hint ──────────────────────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-600 leading-relaxed">
        Select a color above, then click any sticker to paint it. Center cells are fixed.
      </p>
    </div>
  );
}
