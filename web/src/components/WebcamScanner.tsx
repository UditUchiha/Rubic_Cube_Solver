'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CubeState, Color, COLOR_HEX, FACE_NAMES, validate } from '@/lib/cubeState';
import { sampleRegion } from '@/lib/colorClassifier';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState) => void;
  onCancel: () => void;
}

// Face order matches the 54-char string: U L F R B D
const FACE_ORDER: number[] = [0, 1, 2, 3, 4, 5];
// Expected center color for each face (index into Color)
const FACE_CENTERS: Color[] = [0, 1, 2, 3, 4, 5];

const COLORS: Color[] = [0, 1, 2, 3, 4, 5];

export default function WebcamScanner({ onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [faceIdx, setFaceIdx] = useState(0); // which face we're capturing (0-5)
  const [denied, setDenied] = useState(false);
  const [detectedColors, setDetectedColors] = useState<Color[] | null>(null);
  const [scannedFaces, setScannedFaces] = useState<(Color[] | null)[]>(Array(6).fill(null));
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const face = FACE_ORDER[faceIdx];

  // Start camera
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => setDenied(true));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Draw grid overlay on the video
  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!overlay || !video || video.readyState < 2) return;

    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    overlay.width = vw;
    overlay.height = vh;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, vw, vh);

    const gridSize = Math.floor(Math.min(vw, vh) * 0.4);
    const cellSize = Math.floor(gridSize / 3);
    const gridX = Math.floor((vw - gridSize) / 2);
    const gridY = Math.floor((vh - gridSize) / 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(gridX, gridY, gridSize, gridSize);

    for (let r = 0; r <= 3; r++) {
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + r * cellSize);
      ctx.lineTo(gridX + gridSize, gridY + r * cellSize);
      ctx.stroke();
    }
    for (let c = 0; c <= 3; c++) {
      ctx.beginPath();
      ctx.moveTo(gridX + c * cellSize, gridY);
      ctx.lineTo(gridX + c * cellSize, gridY + gridSize);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(drawOverlay, 100);
    return () => clearInterval(interval);
  }, [drawOverlay]);

  function getGridParams() {
    const video = videoRef.current;
    if (!video) return null;
    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    const gridSize = Math.floor(Math.min(vw, vh) * 0.4);
    const cellSize = Math.floor(gridSize / 3);
    const gridX = Math.floor((vw - gridSize) / 2);
    const gridY = Math.floor((vh - gridSize) / 2);
    return { gridX, gridY, cellSize, vw, vh };
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const g = getGridParams();
    if (!g) return;
    const { gridX, gridY, cellSize, vw, vh } = g;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const colors: Color[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = gridX + col * cellSize + Math.floor(cellSize / 2);
        const cy = gridY + row * cellSize + Math.floor(cellSize / 2);
        if (row === 1 && col === 1) {
          // Center is locked to expected face color
          colors.push(FACE_CENTERS[face]);
        } else {
          colors.push(sampleRegion(ctx, cx, cy, 20, 20));
        }
      }
    }
    setDetectedColors(colors);
  }

  function handleCorrectCell(cellIdx: number) {
    if (!detectedColors) return;
    const next = [...detectedColors] as Color[];
    next[cellIdx] = ((next[cellIdx] + 1) % 6) as Color;
    setDetectedColors(next);
  }

  function handleUseFace() {
    if (!detectedColors) return;
    const next = [...scannedFaces];
    next[faceIdx] = detectedColors;
    setScannedFaces(next);

    if (faceIdx < 5) {
      setFaceIdx(faceIdx + 1);
      setDetectedColors(null);
    } else {
      // All 6 faces scanned — assemble state
      const state: Color[] = new Array(54);
      for (let f = 0; f < 6; f++) {
        const colors = next[f]!;
        for (let i = 0; i < 9; i++) {
          state[f * 9 + i] = colors[i];
        }
      }
      const { valid, errors } = validate(state as CubeState);
      if (valid) {
        onComplete(state as CubeState);
      } else {
        setValidationErrors(errors);
      }
    }
  }

  function handleRescan() {
    setDetectedColors(null);
  }

  if (denied) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center text-gray-400">
        <p>Camera access denied. Use manual input instead.</p>
        <button onClick={onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
          Back to Manual
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Video + overlay */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Instructions */}
      <div className="text-center text-sm text-gray-300">
        <span className="font-semibold text-white">Face {faceIdx + 1} of 6 — {FACE_NAMES[face].toUpperCase()}</span>
        <span className="ml-2 text-gray-400">
          Point camera at the <span style={{ color: COLOR_HEX[FACE_CENTERS[face]] }} className="font-semibold">
            {['White', 'Green', 'Red', 'Blue', 'Orange', 'Yellow'][FACE_CENTERS[face]]}
          </span> center
        </span>
      </div>

      {/* Detected color preview */}
      {detectedColors && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 text-center">Tap a cell to cycle its color</p>
          <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
            {detectedColors.map((color, i) => {
              const isCenter = i === 4;
              return (
                <button
                  key={i}
                  onClick={() => !isCenter && handleCorrectCell(i)}
                  disabled={isCenter}
                  className={clsx(
                    'w-10 h-10 rounded border-2 transition-transform',
                    isCenter ? 'border-gray-400 cursor-default' : 'border-gray-600 hover:border-white hover:scale-110 cursor-pointer'
                  )}
                  style={{ backgroundColor: COLOR_HEX[color] }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-sm text-red-300 flex flex-col gap-1">
          {validationErrors.map((e, i) => <span key={i}>• {e}</span>)}
          <button
            onClick={() => { setFaceIdx(0); setScannedFaces(Array(6).fill(null)); setDetectedColors(null); setValidationErrors([]); }}
            className="mt-1 text-xs underline text-red-400 hover:text-red-200"
          >
            Re-scan all faces
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {!detectedColors ? (
          <>
            <button
              onClick={handleCapture}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
            >
              Capture Face
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleRescan}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm"
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

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={clsx(
              'w-2.5 h-2.5 rounded-full transition-colors',
              i < faceIdx ? 'bg-green-500' : i === faceIdx ? 'bg-indigo-400' : 'bg-gray-600'
            )}
          />
        ))}
      </div>

      {/* Color palette legend */}
      <div className="flex justify-center gap-1.5 flex-wrap">
        {COLORS.map((c) => (
          <div key={c} className="flex items-center gap-1 text-xs text-gray-400">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_HEX[c] }} />
            {['W', 'G', 'R', 'B', 'O', 'Y'][c]}
          </div>
        ))}
      </div>
    </div>
  );
}
