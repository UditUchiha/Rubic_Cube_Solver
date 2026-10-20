'use client';

import { useRef, useState, useEffect } from 'react';
import { CubeState, Color, COLOR_HEX, COLOR_NAMES, FACE_NAMES } from '@/lib/cubeState';
import { sampleRegionRGB, assignFaceColors, buildReferences, RGB } from '@/lib/colorClassifier';
import { FACE_ORIENTATION, Overrides, ScanResult, dropFace, finishScan, matchPhotosToFaces } from '@/lib/scan';
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

interface LoadedPhoto {
  url: string;
  ctx: CanvasRenderingContext2D;
}

/* Validate and decode one photo into a downscaled canvas. Throws an Error with a user-facing message. */
async function loadPhoto(file: File): Promise<LoadedPhoto> {
  // Desktop browsers often report an iPhone .heic as type '', so go by name too.
  const heic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
  if (!heic && !file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 20 MB.`);

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    // Safari decodes HEIC itself, so it is only rejected once decoding fails.
    throw new Error(heic
      ? 'This browser can\'t open HEIC photos. Use Safari, or export the photo as JPEG.'
      : `${file.name} could not be read.`);
  }
  return { url, ctx: toCanvas(img) };
}

/* Starting grid: 60% of the short side, centred. People centre the cube, so its centre sticker is usually here. */
function defaultGrid(w: number, h: number) {
  const gridSize = Math.floor(Math.min(w, h) * 0.6);
  return { gridSize, gridX: Math.floor((w - gridSize) / 2), gridY: Math.floor((h - gridSize) / 2) };
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

/* Opens the rear camera on phones. Hidden where a mouse is used: desktop ignores `capture` and shows a file picker. */
function TakePhoto({ onChange, className }: { onChange: React.ChangeEventHandler<HTMLInputElement>; className: string }) {
  return (
    <label className={clsx(className, 'text-center text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold cursor-pointer transition-colors [@media(pointer:fine)]:hidden')}>
      Take photo
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
    </label>
  );
}

export default function ImageUpload({ onComplete }: Props) {
  const [faces, setFaces] = useState<(FaceData | null)[]>(Array(6).fill(null));
  const [activeFace, setActiveFace] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [matchNote, setMatchNote] = useState<string | null>(null);
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setFileError(null);
    setMatchNote(null);

    // Decide the target faces now. This used to read `activeFace` after the
    // async decode, so switching tabs meanwhile wrote the colours onto
    // whichever face happened to be selected by then. One photo replaces the
    // active face; six or more refill every face; otherwise the empty ones.
    const targets = files.length === 1 ? [activeFace]
      : files.length >= 6 ? [0, 1, 2, 3, 4, 5]
      : faces.flatMap((f, i) => (f ? [] : [i]));
    if (files.length > 6 || files.length > targets.length) {
      setFileError(files.length > 6
        ? 'Pick at most 6 photos, one per face.'
        : `Only ${targets.length} faces are left to fill. Pick up to ${targets.length} photos, or all 6.`);
      return;
    }

    const settled = await Promise.allSettled(files.map(loadPhoto));
    const failure = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failure) {
      settled.forEach((s) => { if (s.status === 'fulfilled') URL.revokeObjectURL(s.value.url); });
      setFileError(failure.reason instanceof Error ? failure.reason.message : 'A photo could not be read.');
      return;
    }
    const photos = settled.map((s) => {
      const { url, ctx } = (s as PromiseFulfilledResult<LoadedPhoto>).value;
      const { width: w, height: h } = ctx.canvas;
      return { url, ctx, w, h, ...defaultGrid(w, h) };
    });

    // The default grid's centre cell is the photo's centre.
    const assigned = files.length === 1 ? targets : matchPhotosToFaces(photos.map((p) => {
      const probe = Math.max(4, Math.round((p.gridSize / 3) * 0.3));
      return sampleRegionRGB(p.ctx, p.w / 2, p.h / 2, probe, probe);
    }), targets);

    photos.forEach((p, i) => imageCache.current.set(assigned[i], p.ctx));
    setFaces((prev) => {
      const next = [...prev];
      photos.forEach((p, i) => {
        const face = assigned[i];
        if (next[face]) URL.revokeObjectURL(next[face]!.imgUrl);
        next[face] = {
          imgUrl: p.url, w: p.w, h: p.h, gridX: p.gridX, gridY: p.gridY, gridSize: p.gridSize,
          ...extract(p.ctx, p.gridX, p.gridY, p.gridSize, face, next),
        };
      });
      return next;
    });
    setOverrides((o) => assigned.reduce((acc, face) => dropFace(acc, face), o));
    setFailed(null);
    if (files.length > 1) {
      setActiveFace(assigned[0]);
      setMatchNote('Photos were matched to faces by centre colour. Check each tab.');
    }
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
                ? 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
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
          <span className="font-semibold swatch-label" style={{ color: COLOR_HEX[activeFace as Color] }}>
            {COLOR_NAMES[activeFace as Color]}
          </span>{' '}
          centre
        </p>
        <p className="text-xs text-slate-500">
          Top edge must be{' '}
          <span className="font-semibold swatch-label" style={{ color: COLOR_HEX[orientation.top] }}>
            {COLOR_NAMES[orientation.top]}
          </span>
          , left edge{' '}
          <span className="font-semibold swatch-label" style={{ color: COLOR_HEX[orientation.left] }}>
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

          <div className="flex gap-2">
            <label className="flex-1 py-2 text-center bg-slate-700 hover:bg-slate-600 rounded-lg text-sm cursor-pointer transition-colors">
              Replace Photo
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
            <TakePhoto onChange={handleFileChange} className="flex-1 py-2" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col items-center justify-center gap-1 h-32 px-4 text-center bg-slate-800/50 border-2 border-dashed border-slate-600 hover:border-slate-400 rounded-xl cursor-pointer transition-colors">
            <svg className="mb-1 text-slate-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm text-slate-300">Choose photos</span>
            <span className="text-xs text-slate-500">Pick all six at once and they are matched to faces by centre colour</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </label>
          <TakePhoto onChange={handleFileChange} className="py-2.5" />
        </div>
      )}

      {fileError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{fileError}</div>
      )}
      {matchNote && <p className="text-xs text-indigo-300" role="status">{matchNote}</p>}

      {currentFace && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">Detected colours (tap to correct):</p>
          <FaceColorGrid colors={currentFace.colors} onCycle={cycleCell} />
        </div>
      )}

      {failed && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-700 dark:text-red-300 flex flex-col gap-1">
          <span className="font-semibold text-red-600 dark:text-red-400">These photos are not a solvable cube</span>
          {failed.errors.map((e, i) => <span key={i}>• {e}</span>)}
          <button
            onClick={() => onComplete(failed.state, [])}
            className="mt-1 text-xs underline text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 self-start"
          >
            Fix colours in the editor
          </button>
        </div>
      )}

      <button
        onClick={handleFinish}
        disabled={!allUploaded}
        className="w-full py-3 text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors"
      >
        {allUploaded ? 'Use These Colours' : `Upload all 6 faces (${faces.filter(Boolean).length}/6 done)`}
      </button>
    </div>
  );
}
