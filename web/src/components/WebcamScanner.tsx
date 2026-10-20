'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CubeState, Color, COLOR_HEX, COLOR_NAMES, FACE_NAMES } from '@/lib/cubeState';
import { sampleRegionRGB, assignFaceColors, buildReferences, RGB } from '@/lib/colorClassifier';
import { FACE_ORIENTATION, Overrides, ScanResult, dropFace, finishScan } from '@/lib/scan';
import FaceColorGrid from './FaceColorGrid';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState, notes: string[]) => void;
  onCancel: () => void;
}

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
  const [overrides, setOverrides] = useState<Overrides>({});
  const [failed, setFailed] = useState<ScanResult | null>(null);

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
    setOverrides((o) => dropFace(o, face));
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
    setPreview(null);

    // Faces can be re-scanned out of order, so go to whichever is still missing.
    const missing = next.findIndex((f) => !f);
    if (missing !== -1) { setFaceIdx(missing); return; }

    const result = finishScan(next.flatMap((f) => f!.samples), overrides);
    if (result.errors.length === 0) onComplete(result.state, result.notes);
    else setFailed(result);
  }

  function restart() {
    setFaceIdx(0);
    setScanned(Array(6).fill(null));
    setPreview(null);
    setOverrides({});
    setFailed(null);
  }

  const isLastFace = scanned.every((f, i) => i === faceIdx || f);

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
          <FaceColorGrid colors={preview.colors} onCycle={cycleCell} />
        </div>
      )}

      {failed && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
          <span className="font-semibold text-red-400">That scan is not a solvable cube</span>
          {failed.errors.map((e, i) => <span key={i}>• {e}</span>)}
          <div className="mt-1 flex gap-4">
            <button
              onClick={() => onComplete(failed.state, [])}
              className="text-xs underline text-red-400 hover:text-red-200"
            >
              Fix colours in the editor
            </button>
            <button onClick={restart} className="text-xs underline text-red-400 hover:text-red-200">
              Re-scan all faces
            </button>
          </div>
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
              {isLastFace ? 'Finish' : 'Use This Face →'}
            </button>
          </>
        )}
      </div>

      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            // A scanned face reopens its saved capture (corrections included) for review.
            onClick={() => { setFaceIdx(i); setPreview(scanned[i]); }}
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
