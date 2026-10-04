'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CubeState, Color, COLOR_HEX, COLOR_NAMES, FACE_NAMES, validate } from '@/lib/cubeState';
import { sampleRegionRGB, assignFaceColors, assignCubeColors, buildReferences, RGB } from '@/lib/colorClassifier';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState) => void;
  onCancel: () => void;
}

/*
 * The 54-character state is not just six faces of colours — each face has a
 * fixed orientation inside it. Scanning a face rotated by 90 degrees produces a
 * cube that is correctly coloured and completely unsolvable, which used to be
 * the single most common way for a scan to fail: nothing on screen ever said
 * which way up to hold the cube.
 *
 * Derived from the sticker adjacencies in cubeState.ts: for each face, which
 * neighbouring face must sit along the top edge and the left edge of the view.
 */
const FACE_ORIENTATION: { top: Color; left: Color }[] = [
  { top: 4, left: 1 }, // U (white):  orange up,  green left
  { top: 0, left: 4 }, // L (green):  white up,   orange left
  { top: 0, left: 1 }, // F (red):    white up,   green left
  { top: 0, left: 2 }, // R (blue):   white up,   red left
  { top: 0, left: 3 }, // B (orange): white up,   blue left
  { top: 2, left: 1 }, // D (yellow): red up,     green left
];

const GRID_FRACTION = 0.62;

/* Where the capture grid sits, in CSS pixels of the displayed video box. */
function gridInDisplaySpace(boxW: number, boxH: number) {
  const gridSize = Math.min(boxW, boxH) * GRID_FRACTION;
  const cell = gridSize / 3;
  return {
    gridX: (boxW - gridSize) / 2,
    gridY: (boxH - gridSize) / 2,
    gridSize,
    cell,
  };
}

/*
 * The video is rendered with object-cover, so it is scaled up and cropped to
 * fill its box. The overlay previously drew in raw video pixels while being
 * stretched across that box, so whenever the camera's aspect ratio differed
 * from the container's the grid on screen was not the region being sampled.
 * This returns the transform that keeps the two in step.
 */
function coverTransform(video: HTMLVideoElement, boxW: number, boxH: number) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !boxW || !boxH) return null;

  const scale = Math.max(boxW / vw, boxH / vh);
  const offsetX = (boxW - vw * scale) / 2;
  const offsetY = (boxH - vh * scale) / 2;

  return {
    scale,
    toVideo: (dx: number, dy: number): [number, number] => [
      (dx - offsetX) / scale,
      (dy - offsetY) / scale,
    ],
  };
}

export default function WebcamScanner({ onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [faceIdx, setFaceIdx] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ colors: Color[]; samples: RGB[] } | null>(null);
  const [scanned, setScanned] = useState<({ colors: Color[]; samples: RGB[] } | null)[]>(
    Array(6).fill(null)
  );
  const [overrides, setOverrides] = useState<Record<number, Color>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const face = faceIdx;
  const orientation = FACE_ORIENTATION[face];

  // ── Camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This browser does not support camera access.');
        return;
      }
      // Prefer the rear camera, but fall back to any camera: on a laptop the
      // environment-facing constraint fails outright rather than degrading.
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: true },
      ];

      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // play() rejects if the element is detached or autoplay is blocked.
            await videoRef.current.play().catch(() => {});
          }
          return;
        } catch {
          /* try the next constraint set */
        }
      }
      if (!cancelled) {
        setCameraError('Could not access the camera. Check permissions, or use Manual input.');
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Grid overlay, drawn in display space on an animation frame ────────────
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (overlay && video && video.readyState >= 2) {
      const boxW = overlay.clientWidth;
      const boxH = overlay.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (overlay.width !== Math.round(boxW * dpr) || overlay.height !== Math.round(boxH * dpr)) {
        overlay.width = Math.round(boxW * dpr);
        overlay.height = Math.round(boxH * dpr);
      }

      const ctx = overlay.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, boxW, boxH);

        const { gridX, gridY, gridSize, cell } = gridInDisplaySpace(boxW, boxH);

        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, boxW, boxH);
        ctx.clearRect(gridX, gridY, gridSize, gridSize);

        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(gridX, gridY, gridSize, gridSize);

        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(gridX, gridY + i * cell);
          ctx.lineTo(gridX + gridSize, gridY + i * cell);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(gridX + i * cell, gridY);
          ctx.lineTo(gridX + i * cell, gridY + gridSize);
          ctx.stroke();
        }

        // Mark the exact pixels each cell samples, so a misaligned cube is
        // obvious before the shutter rather than after validation fails.
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        const probe = cell * 0.3;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.fillRect(
              gridX + c * cell + cell / 2 - probe / 2,
              gridY + r * cell + cell / 2 - probe / 2,
              probe,
              probe
            );
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(drawOverlay);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawOverlay);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawOverlay]);

  // ── Capture ───────────────────────────────────────────────────────────────
  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!video || !canvas || !overlay || video.readyState < 2) return;

    const boxW = overlay.clientWidth;
    const boxH = overlay.clientHeight;
    const transform = coverTransform(video, boxW, boxH);
    if (!transform) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const { gridX, gridY, cell } = gridInDisplaySpace(boxW, boxH);
    // Sample a box a little under a third of a cell, so sticker edges and the
    // black gaps between stickers stay out of the average.
    const probe = Math.max(4, Math.round((cell * 0.3) / transform.scale));

    const samples: RGB[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const [vx, vy] = transform.toVideo(
          gridX + col * cell + cell / 2,
          gridY + row * cell + cell / 2
        );
        samples.push(sampleRegionRGB(ctx, vx, vy, probe, probe));
      }
    }

    // Build references from every centre captured so far, including this one.
    const centres: (RGB | null)[] = Array(6).fill(null);
    scanned.forEach((f, i) => { if (f) centres[i] = f.samples[4]; });
    centres[face] = samples[4];

    const colors = assignFaceColors(samples, face, buildReferences(centres));
    setPreview({ colors, samples });
  }

  function cycleCell(cellIdx: number) {
    if (!preview || cellIdx === 4) return;
    const next = [...preview.colors] as Color[];
    next[cellIdx] = ((next[cellIdx] + 1) % 6) as Color;
    setPreview({ ...preview, colors: next });
    setOverrides((o) => ({ ...o, [face * 9 + cellIdx]: next[cellIdx] }));
  }

  function handleUseFace() {
    if (!preview) return;
    const next = [...scanned];
    next[faceIdx] = preview;
    setScanned(next);

    if (faceIdx < 5) {
      setFaceIdx(faceIdx + 1);
      setPreview(null);
      return;
    }

    // All six captured. Classify every sticker in one pass now that the exact
    // nine-per-colour quota applies — this is what settles red versus orange.
    const allSamples: RGB[] = [];
    next.forEach((f) => f!.samples.forEach((s) => allSamples.push(s)));

    const assigned = assignCubeColors(allSamples);
    // Anything the user corrected by hand wins over the classifier.
    Object.entries(overrides).forEach(([idx, color]) => { assigned[Number(idx)] = color; });
    for (let f = 0; f < 6; f++) assigned[f * 9 + 4] = f as Color;

    const { valid, errors } = validate(assigned as CubeState);
    if (valid) onComplete(assigned as CubeState);
    else setValidationErrors(errors);
  }

  function restart() {
    setFaceIdx(0);
    setScanned(Array(6).fill(null));
    setPreview(null);
    setOverrides({});
    setValidationErrors([]);
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center text-slate-400">
        <p className="max-w-xs text-sm">{cameraError}</p>
        <button onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
          Back to Manual
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* ── Which face, and crucially which way up ──────────────────────────── */}
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm">
          <span className="font-semibold text-white">Face {faceIdx + 1} of 6</span>
          <span className="text-slate-400"> — show the </span>
          <span className="font-semibold" style={{ color: COLOR_HEX[face as Color] }}>
            {COLOR_NAMES[face as Color]}
          </span>
          <span className="text-slate-400"> centre ({FACE_NAMES[face]})</span>
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
            top edge:
            <span className="font-semibold" style={{ color: COLOR_HEX[orientation.top] }}>
              {COLOR_NAMES[orientation.top]}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            left edge:
            <span className="font-semibold" style={{ color: COLOR_HEX[orientation.left] }}>
              {COLOR_NAMES[orientation.left]}
            </span>
          </span>
        </div>
        <p className="text-[11px] text-slate-600">
          Rotating a face by 90° makes a cube that cannot be solved, so these two edges matter.
        </p>
      </div>

      {preview && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400 text-center">Tap a cell to correct it</p>
          <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
            {preview.colors.map((color, i) => (
              <button
                key={i}
                onClick={() => cycleCell(i)}
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
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
          <span className="font-semibold text-red-400">That scan is not a solvable cube</span>
          {validationErrors.map((e, i) => <span key={i}>• {e}</span>)}
          <button onClick={restart} className="mt-1 text-xs underline text-red-400 hover:text-red-200 self-start">
            Re-scan all faces
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {!preview ? (
          <>
            <button
              onClick={handleCapture}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
            >
              Capture Face
            </button>
            <button onClick={onCancel} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setPreview(null)}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm"
            >
              Re-scan
            </button>
            <button
              onClick={handleUseFace}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
            >
              {faceIdx < 5 ? 'Use This Face →' : 'Finish'}
            </button>
          </>
        )}
      </div>

      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { if (scanned[i] || i < faceIdx) { setFaceIdx(i); setPreview(null); } }}
            title={`${FACE_NAMES[i]} face`}
            className={clsx(
              'w-2.5 h-2.5 rounded-full transition-colors',
              scanned[i] ? 'bg-green-500' : i === faceIdx ? 'bg-indigo-400' : 'bg-slate-600'
            )}
          />
        ))}
      </div>
    </div>
  );
}
