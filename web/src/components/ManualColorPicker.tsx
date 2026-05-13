'use client';

import { Color, Face, CubeState, COLOR_HEX, FACE_NAMES, setCell, createSolvedState } from '@/lib/cubeState';
import { useState } from 'react';
import clsx from 'clsx';

interface Props {
  state: CubeState;
  onChange: (state: CubeState) => void;
}

const PALETTE: Color[] = [0, 1, 2, 3, 4, 5];

// Cross layout: each entry is [face, gridRow, gridCol] (1-indexed CSS grid)
const FACE_POSITIONS: [Face, number, number][] = [
  [0, 1, 2], // UP
  [1, 2, 1], // LEFT
  [2, 2, 2], // FRONT
  [3, 2, 3], // RIGHT
  [4, 2, 4], // BACK
  [5, 3, 2], // DOWN
];

export default function ManualColorPicker({ state, onChange }: Props) {
  const [activeColor, setActiveColor] = useState<Color>(2); // default Red

  function handleCellClick(face: Face, row: number, col: number) {
    // Lock center cells
    if (row === 1 && col === 1) return;
    onChange(setCell(state, face, row, col, activeColor));
  }

  function handleReset() {
    onChange(createSolvedState());
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Color palette */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 mr-1">Color:</span>
        {PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            className={clsx(
              'w-8 h-8 rounded-full border-2 transition-transform',
              activeColor === color
                ? 'border-white scale-125 shadow-lg'
                : 'border-gray-600 hover:border-gray-400'
            )}
            style={{ backgroundColor: COLOR_HEX[color] }}
            title={['White', 'Green', 'Red', 'Blue', 'Orange', 'Yellow'][color]}
          />
        ))}
        <button
          onClick={handleReset}
          className="ml-4 text-xs text-gray-400 hover:text-white underline"
        >
          Reset
        </button>
      </div>

      {/* Cube net (cross layout) */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: 'repeat(4, auto)',
          gridTemplateRows: 'repeat(3, auto)',
        }}
      >
        {FACE_POSITIONS.map(([face, gridRow, gridCol]) => (
          <div
            key={face}
            className="grid gap-0.5"
            style={{
              gridRow,
              gridColumn: gridCol,
              gridTemplateColumns: 'repeat(3, 1fr)',
            }}
          >
            <div className="col-span-3 text-center text-xs text-gray-500 mb-0.5">
              {FACE_NAMES[face]}
            </div>
            {Array.from({ length: 9 }, (_, i) => {
              const row = Math.floor(i / 3);
              const col = i % 3;
              const isCenter = row === 1 && col === 1;
              const color = state[face * 9 + i];
              return (
                <button
                  key={i}
                  onClick={() => handleCellClick(face, row, col)}
                  className={clsx(
                    'w-9 h-9 rounded border transition-all',
                    isCenter
                      ? 'cursor-default border-gray-500 opacity-90'
                      : 'cursor-pointer border-gray-600 hover:border-white hover:scale-105'
                  )}
                  style={{ backgroundColor: COLOR_HEX[color] }}
                  disabled={isCenter}
                  title={isCenter ? `${FACE_NAMES[face]} center (fixed)` : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
