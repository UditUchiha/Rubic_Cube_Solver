'use client';

import clsx from 'clsx';
import { Color, COLOR_HEX, COLOR_NAMES } from '@/lib/cubeState';

interface Props {
  colors: Color[];
  onCycle: (cell: number) => void;
}

/* One face's detected colours; tap a cell to cycle it. The centre is fixed by the face. */
export default function FaceColorGrid({ colors, onCycle }: Props) {
  return (
    <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
      {colors.map((color, i) => (
        <button
          key={i}
          onClick={() => onCycle(i)}
          disabled={i === 4}
          aria-label={`${COLOR_NAMES[color]}${i === 4 ? ' (centre, fixed)' : ''}`}
          className={clsx(
            'w-10 h-10 rounded border-2 transition-transform',
            i === 4
              ? 'border-slate-400 cursor-default'
              : 'border-slate-600 hover:border-white hover:scale-110 cursor-pointer'
          )}
          style={{ backgroundColor: COLOR_HEX[color] }}
        />
      ))}
    </div>
  );
}
