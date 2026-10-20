'use client';

import { useRef, useState, useEffect } from 'react';
import { CubeState, Color, COLOR_HEX, COLOR_NAMES, FACE_NAMES } from '@/lib/cubeState';
import { sampleRegionRGB, assignFaceColors, buildReferences, RGB } from '@/lib/colorClassifier';
import { FACE_ORIENTATION, Overrides, ScanResult, dropFace, finishScan } from '@/lib/scan';
import FaceColorGrid from './FaceColorGrid';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState, notes: string[]) => void;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
// iOS Safari caps a canvas at ~16.7 MP and draws a 24/48 MP photo blank above it.
const MAX_SIDE = 1600;

interface FaceData {
  imgUrl: string;
  // Size of the downscaled canvas the samples come from. The <img> keeps the
  // same aspect ratio, so the SVG overlay can use these as its viewBox.
  w: number;
  h: number;
  gridX: number;
  gridY: number;
  gridSize: number;
  samples: RGB[];
  colors: Color[];
}

function toCanvas(img: HTMLImageElement): CanvasRenderingContext2D {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx;
}

function extract(
  ctx: CanvasRenderingContext2D, gridX: number, gridY: number, gridSize: number, faceIdx: number,
  allFaces: (FaceData | null)[]
): { samples: RGB[]; colors: Color[] } {
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
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function ImageUpload({ onComplete }: Props) {
  const [faces, setFaces] = useState<(FaceData | null)[]>(Array(6).fill(null));
  const [activeFace, setActiveFace] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [failed, setFailed] = useState<ScanResult | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Downscaled pixels per face, kept so moving the grid only re-reads nine
  // small boxes instead of re-decoding or redrawing the photo.
  const imageCache = useRef<Map<number, CanvasRenderingContext2D>>(new Map());

  // Object URLs are not reclaimed on their own; release them with the component.
  // Read through a ref: the cleanup closure would otherwise see the first render's faces.
  const facesRef = useRef(faces);
  facesRef.current = faces;
  useEffect(() => () => {
    facesRef.current.forEach((f) => { if (f) URL.revokeObjectURL(f.imgUrl); });
  }, []);

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
      const ctx = toCanvas(img);
      const { width: w, height: h } = ctx.canvas;
      const gridSize = Math.floor(Math.min(w, h) * 0.6);
      const gridX = Math.floor((w - gridSize) / 2);
      const gridY = Math.floor((h - gridSize) / 2);

      imageCache.current.set(targetFace, ctx);

      setFaces((prev) => {
        const old = prev[targetFace];
        if (old) URL.revokeObjectURL(old.imgUrl);

        const next = [...prev];
        next[targetFace] = {
          imgUrl: url, w, h, gridX, gridY, gridSize,
          ...extract(ctx, gridX, gridY, gridSize, targetFace, prev),
        };
        return next;
      });
      setOverrides((o) => dropFace(o, targetFace));
      setFailed(null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setFileError('That image could not be read.');
    };

    img.src = url;
  }

  /* Move or resize one face's grid and re-read its colours straight away. */
  function updateGrid(face: number, patch: { gridX?: number; gridY?: number; gridSize?: number }) {
    const ctx = imageCache.current.get(face);
    if (!ctx) return;
    setFaces((prev) => {
      const f = prev[face];
      if (!f) return prev;
      const gridSize = clamp(patch.gridSize ?? f.gridSize, 40, Math.min(f.w, f.h));
      const gridX = clamp(patch.gridX ?? f.gridX, 0, f.w - gridSize);
      const gridY = clamp(patch.gridY ?? f.gridY, 0, f.h - gridSize);
      const next = [...prev];
      next[face] = { ...f, gridX, gridY, gridSize, ...extract(ctx, gridX, gridY, gridSize, face, prev) };
      return next;
    });
    setOverrides((o) => dropFace(o, face));
    setFailed(null);
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
      x: ((e.clientX - rect.left) / rect.width) * faceData.w,
      y: ((e.clientY - rect.top) / rect.height) * faceData.h,
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
    updateGrid(activeFace, { gridX: p.x - dragOffset.current.x, gridY: p.y - dragOffset.current.y });
  }

  function cycleCell(cellIdx: number) {
    const f = faces[activeFace];
    if (cellIdx === 4 || !f) return;
    const colors = [...f.colors] as Color[];
    colors[cellIdx] = ((colors[cellIdx] + 1) % 6) as Color;
    const next = [...faces];
    next[activeFace] = { ...f, colors };
    setFaces(next);
    setOverrides((o) => ({ ...o, [activeFace * 9 + cellIdx]: colors[cellIdx] }));
    setFailed(null);
  }

  function handleFinish() {
    if (faces.some((f) => !f)) return;
    const result = finishScan(faces.flatMap((f) => f!.samples), overrides);
    if (result.errors.length === 0) onComplete(result.state, result.notes);
    else setFailed(result);
  }

  const allUploaded = faces.every((f) => f !== null);
  const currentFace = faces[activeFace];
  const orientation = FACE_ORIENTATION[activeFace];

  return (
    <div className="flex flex-col gap-4">
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
              viewBox={`0 0 ${currentFace.w} ${currentFace.h}`}
              preserveAspectRatio="none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              <rect
                x={currentFace.gridX} y={currentFace.gridY}
                width={currentFace.gridSize} height={currentFace.gridSize}
                fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.9)"
                strokeWidth={Math.max(2, currentFace.w / 300)}
              />
              {[1, 2].map((i) => (
                <g key={i}>
                  <line
                    x1={currentFace.gridX} y1={currentFace.gridY + (i * currentFace.gridSize) / 3}
                    x2={currentFace.gridX + currentFace.gridSize} y2={currentFace.gridY + (i * currentFace.gridSize) / 3}
                    stroke="rgba(255,255,255,0.6)" strokeWidth={Math.max(1, currentFace.w / 500)}
                  />
                  <line
                    x1={currentFace.gridX + (i * currentFace.gridSize) / 3} y1={currentFace.gridY}
                    x2={currentFace.gridX + (i * currentFace.gridSize) / 3} y2={currentFace.gridY + currentFace.gridSize}
                    stroke="rgba(255,255,255,0.6)" strokeWidth={Math.max(1, currentFace.w / 500)}
                  />
                </g>
              ))}
              {/* Required neighbour colours inside the top and left edges, clear of the sample boxes. */}
              <rect
                x={currentFace.gridX} y={currentFace.gridY}
                width={currentFace.gridSize} height={(currentFace.gridSize / 3) * 0.12}
                fill={COLOR_HEX[orientation.top]} stroke="rgba(0,0,0,0.6)" strokeWidth={Math.max(1, currentFace.w / 800)}
              />
              <rect
                x={currentFace.gridX} y={currentFace.gridY}
                width={(currentFace.gridSize / 3) * 0.12} height={currentFace.gridSize}
                fill={COLOR_HEX[orientation.left]} stroke="rgba(0,0,0,0.6)" strokeWidth={Math.max(1, currentFace.w / 800)}
              />
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
              min={Math.round(Math.min(currentFace.w, currentFace.h) * 0.25)}
              max={Math.round(Math.min(currentFace.w, currentFace.h))}
              value={currentFace.gridSize}
              onChange={(e) => updateGrid(activeFace, { gridSize: Number(e.target.value) })}
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
          <FaceColorGrid colors={currentFace.colors} onCycle={cycleCell} />
        </div>
      )}

      {failed && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
          <span className="font-semibold text-red-400">These photos are not a solvable cube</span>
          {failed.errors.map((e, i) => <span key={i}>• {e}</span>)}
          <button
            onClick={() => onComplete(failed.state, [])}
            className="mt-1 text-xs underline text-red-400 hover:text-red-200 self-start"
          >
            Fix colours in the editor
          </button>
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
