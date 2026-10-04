'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CubeState, Color, COLOR_HEX, COLOR_NAMES, FACE_NAMES, validate } from '@/lib/cubeState';
import { sampleRegionRGB, assignFaceColors, assignCubeColors, buildReferences, RGB } from '@/lib/colorClassifier';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState) => void;
}

/*
 * Each face has a fixed orientation inside the 54-character state. A photo
 * taken of a face rotated 90 degrees yields a correctly coloured, unsolvable
 * cube, so the required top and left neighbours are spelled out per face.
 * Matches FACE_ORIENTATION in WebcamScanner.
 */
const FACE_ORIENTATION: { top: Color; left: Color }[] = [
  { top: 4, left: 1 }, // U (white)
  { top: 0, left: 4 }, // L (green)
  { top: 0, left: 1 }, // F (red)
  { top: 0, left: 2 }, // R (blue)
  { top: 0, left: 3 }, // B (orange)
  { top: 2, left: 1 }, // D (yellow)
];

const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface FaceData {
  imgUrl: string;
  naturalW: number;
  naturalH: number;
  gridX: number;
  gridY: number;
  gridSize: number;
  samples: RGB[];
  colors: Color[];
}

export default function ImageUpload({ onComplete }: Props) {
  const [faces, setFaces] = useState<(FaceData | null)[]>(Array(6).fill(null));
  const [activeFace, setActiveFace] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Decoded images, kept so moving the grid does not re-decode the file each
  // time the user lets go of the mouse.
  const imageCache = useRef<Map<number, HTMLImageElement>>(new Map());

  // Object URLs are not reclaimed on their own; release them with the component.
  useEffect(() => {
    const cache = imageCache.current;
    return () => {
      faces.forEach((f) => { if (f) URL.revokeObjectURL(f.imgUrl); });
      cache.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extract = useCallback(
    (img: HTMLImageElement, gridX: number, gridY: number, gridSize: number, faceIdx: number,
     allFaces: (FaceData | null)[]): { samples: RGB[]; colors: Color[] } => {
      const canvas = canvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const cell = gridSize / 3;
      const probe = Math.max(4, Math.round(cell * 0.3));
      const samples: RGB[] = [];
      for (let i = 0; i < 9; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        samples.push(
          sampleRegionRGB(ctx, gridX + col * cell + cell / 2, gridY + row * cell + cell / 2, probe, probe)
        );
      }

      const centres: (RGB | null)[] = Array(6).fill(null);
      allFaces.forEach((f, i) => { if (f) centres[i] = f.samples[4]; });
      centres[faceIdx] = samples[4];

      return { samples, colors: assignFaceColors(samples, faceIdx, buildReferences(centres)) };
    },
    []
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFileError(null);
    if (!file.type.startsWith('image/')) {
      setFileError('That file is not an image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That image is larger than 20 MB.');
      return;
    }

    // Capture the target face now. This used to read `activeFace` inside the
    // async onload handler, so switching tabs while a photo decoded wrote the
    // colours onto whichever face happened to be selected by then.
    const targetFace = activeFace;
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const gridSize = Math.floor(Math.min(img.naturalWidth, img.naturalHeight) * 0.6);
      const gridX = Math.floor((img.naturalWidth - gridSize) / 2);
      const gridY = Math.floor((img.naturalHeight - gridSize) / 2);

      imageCache.current.set(targetFace, img);

      setFaces((prev) => {
        const old = prev[targetFace];
        if (old) URL.revokeObjectURL(old.imgUrl);

        const { samples, colors } = extract(img, gridX, gridY, gridSize, targetFace, prev);
        const next = [...prev];
        next[targetFace] = {
          imgUrl: url,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          gridX, gridY, gridSize, samples, colors,
        };
        return next;
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setFileError('That image could not be read.');
    };

    img.src = url;
  }

  // ── Grid dragging. Pointer events cover mouse, touch and pen in one path;
  //    the previous mouse-only handlers meant the grid could not be moved on a
  //    phone, which is where the photos come from. ───────────────────────────
  function svgPoint(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    const faceData = faces[activeFace];
    if (!svg || !faceData) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * faceData.naturalW,
      y: ((e.clientY - rect.top) / rect.height) * faceData.naturalH,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = svgPoint(e);
    const faceData = faces[activeFace];
    if (!p || !faceData) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffset.current = { x: p.x - faceData.gridX, y: p.y - faceData.gridY };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const p = svgPoint(e);
    if (!p) return;
    setFaces((prev) => {
      const f = prev[activeFace];
      if (!f) return prev;
      const next = [...prev];
      next[activeFace] = {
        ...f,
        gridX: Math.max(0, Math.min(f.naturalW - f.gridSize, p.x - dragOffset.current.x)),
        gridY: Math.max(0, Math.min(f.naturalH - f.gridSize, p.y - dragOffset.current.y)),
      };
      return next;
    });
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    reExtract();
  }

  function reExtract() {
    const img = imageCache.current.get(activeFace);
    const f = faces[activeFace];
    if (!img || !f) return;
    setFaces((prev) => {
      const cur = prev[activeFace];
      if (!cur) return prev;
      const { samples, colors } = extract(img, cur.gridX, cur.gridY, cur.gridSize, activeFace, prev);
      const next = [...prev];
      next[activeFace] = { ...cur, samples, colors };
      return next;
    });
  }

  function resizeGrid(gridSize: number) {
    setFaces((prev) => {
      const f = prev[activeFace];
      if (!f) return prev;
      const size = Math.max(40, Math.min(Math.min(f.naturalW, f.naturalH), gridSize));
      const next = [...prev];
      next[activeFace] = {
        ...f,
        gridSize: size,
        gridX: Math.max(0, Math.min(f.naturalW - size, f.gridX)),
        gridY: Math.max(0, Math.min(f.naturalH - size, f.gridY)),
      };
      return next;
    });
  }

  function cycleCell(cellIdx: number) {
    if (cellIdx === 4) return;
    setFaces((prev) => {
      const f = prev[activeFace];
      if (!f) return prev;
      const colors = [...f.colors] as Color[];
      colors[cellIdx] = ((colors[cellIdx] + 1) % 6) as Color;
      const next = [...prev];
      next[activeFace] = { ...f, colors };
      return next;
    });
  }

  function handleFinish() {
    if (faces.some((f) => !f)) return;

    // Classify all 54 at once: only with the whole cube in hand does the exact
    // nine-per-colour quota apply, and that is what separates red from orange.
    const allSamples: RGB[] = [];
    faces.forEach((f) => f!.samples.forEach((s) => allSamples.push(s)));
    const assigned = assignCubeColors(allSamples);

    // Per-face manual corrections take priority over the classifier.
    faces.forEach((f, fi) => {
      f!.colors.forEach((c, ci) => {
        const auto = assignFaceColors(f!.samples, fi)[ci];
        if (c !== auto) assigned[fi * 9 + ci] = c;
      });
    });
    for (let f = 0; f < 6; f++) assigned[f * 9 + 4] = f as Color;

    const { valid, errors } = validate(assigned as CubeState);
    if (valid) onComplete(assigned as CubeState);
    else setValidationErrors(errors);
  }

  const allUploaded = faces.every((f) => f !== null);
  const currentFace = faces[activeFace];
  const orientation = FACE_ORIENTATION[activeFace];

  return (
    <div className="flex flex-col gap-4">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => setActiveFace(i)}
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1',
              activeFace === i
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : faces[i]
                ? 'bg-green-900/40 border-green-700 text-green-300'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
            )}
          >
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: COLOR_HEX[i as Color] }} />
            {FACE_NAMES[i]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-300">
          {FACE_NAMES[activeFace]} —{' '}
          <span className="font-semibold" style={{ color: COLOR_HEX[activeFace as Color] }}>
            {COLOR_NAMES[activeFace as Color]}
          </span>{' '}
          centre
        </p>
        <p className="text-xs text-slate-500">
          Top edge must be{' '}
          <span className="font-semibold" style={{ color: COLOR_HEX[orientation.top] }}>
            {COLOR_NAMES[orientation.top]}
          </span>
          , left edge{' '}
          <span className="font-semibold" style={{ color: COLOR_HEX[orientation.left] }}>
            {COLOR_NAMES[orientation.left]}
          </span>
          .
        </p>
      </div>

      {currentFace ? (
        <div className="flex flex-col gap-2">
          <div className="relative select-none touch-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentFace.imgUrl} alt={`${FACE_NAMES[activeFace]} face`} className="w-full rounded-lg" draggable={false} />
            <svg
              ref={svgRef}
              className={clsx('absolute inset-0 w-full h-full', dragging ? 'cursor-grabbing' : 'cursor-grab')}
              viewBox={`0 0 ${currentFace.naturalW} ${currentFace.naturalH}`}
              preserveAspectRatio="none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <rect
                x={currentFace.gridX} y={currentFace.gridY}
                width={currentFace.gridSize} height={currentFace.gridSize}
                fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.9)"
                strokeWidth={Math.max(2, currentFace.naturalW / 300)}
              />
              {[1, 2].map((i) => (
                <g key={i}>
                  <line
                    x1={currentFace.gridX} y1={currentFace.gridY + (i * currentFace.gridSize) / 3}
                    x2={currentFace.gridX + currentFace.gridSize} y2={currentFace.gridY + (i * currentFace.gridSize) / 3}
                    stroke="rgba(255,255,255,0.6)" strokeWidth={Math.max(1, currentFace.naturalW / 500)}
                  />
                  <line
                    x1={currentFace.gridX + (i * currentFace.gridSize) / 3} y1={currentFace.gridY}
                    x2={currentFace.gridX + (i * currentFace.gridSize) / 3} y2={currentFace.gridY + currentFace.gridSize}
                    stroke="rgba(255,255,255,0.6)" strokeWidth={Math.max(1, currentFace.naturalW / 500)}
                  />
                </g>
              ))}
              {/* Show exactly which pixels get sampled. */}
              {Array.from({ length: 9 }, (_, i) => {
                const cell = currentFace.gridSize / 3;
                const probe = cell * 0.3;
                return (
                  <rect
                    key={`p${i}`}
                    x={currentFace.gridX + (i % 3) * cell + cell / 2 - probe / 2}
                    y={currentFace.gridY + Math.floor(i / 3) * cell + cell / 2 - probe / 2}
                    width={probe} height={probe}
                    fill="rgba(255,255,255,0.25)"
                  />
                );
              })}
            </svg>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            Grid size
            <input
              type="range"
              min={Math.round(Math.min(currentFace.naturalW, currentFace.naturalH) * 0.25)}
              max={Math.round(Math.min(currentFace.naturalW, currentFace.naturalH))}
              value={currentFace.gridSize}
              onChange={(e) => resizeGrid(Number(e.target.value))}
              onPointerUp={reExtract}
              className="flex-1 accent-indigo-500"
            />
          </label>

          <label className="py-2 text-center bg-slate-700 hover:bg-slate-600 rounded-lg text-sm cursor-pointer transition-colors">
            Replace Photo
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-32 bg-slate-800/50 border-2 border-dashed border-slate-600 hover:border-slate-400 rounded-xl cursor-pointer transition-colors">
          <span className="text-2xl mb-1">📷</span>
          <span className="text-sm text-slate-400">Click to upload a photo</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      )}

      {fileError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">{fileError}</div>
      )}

      {currentFace && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">Detected colours (tap to correct):</p>
          <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
            {currentFace.colors.map((color, i) => (
              <button
                key={i}
                onClick={() => cycleCell(i)}
                disabled={i === 4}
                aria-label={`${COLOR_NAMES[color]}${i === 4 ? ' (centre, fixed)' : ''}`}
                className={clsx(
                  'w-10 h-10 rounded border-2 transition-transform',
                  i === 4
                    ? 'border-slate-400 cursor-default opacity-80'
                    : 'border-slate-600 hover:border-white hover:scale-110 cursor-pointer'
                )}
                style={{ backgroundColor: COLOR_HEX[color] }}
              />
            ))}
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
          <span className="font-semibold text-red-400">These photos are not a solvable cube</span>
          {validationErrors.map((e, i) => <span key={i}>• {e}</span>)}
        </div>
      )}

      <button
        onClick={handleFinish}
        disabled={!allUploaded}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors"
      >
        {allUploaded ? 'Use These Colours' : `Upload all 6 faces (${faces.filter(Boolean).length}/6 done)`}
      </button>
    </div>
  );
}
