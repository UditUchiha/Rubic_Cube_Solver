'use client';

import { useRef, useState } from 'react';
import { CubeState, Color, COLOR_HEX, FACE_NAMES, validate } from '@/lib/cubeState';
import { sampleRegion } from '@/lib/colorClassifier';
import clsx from 'clsx';

interface Props {
  onComplete: (state: CubeState) => void;
}

const FACE_LABELS = [
  'UP (White center)',
  'LEFT (Green center)',
  'FRONT (Red center)',
  'RIGHT (Blue center)',
  'BACK (Orange center)',
  'DOWN (Yellow center)',
];
const FACE_CENTERS: Color[] = [0, 1, 2, 3, 4, 5];

interface FaceData {
  imgUrl: string;
  colors: Color[];
  gridX: number;
  gridY: number;
  gridSize: number;
}

export default function ImageUpload({ onComplete }: Props) {
  const [faces, setFaces] = useState<(FaceData | null)[]>(Array(6).fill(null));
  const [activeFace, setActiveFace] = useState(0);
  const [draggingGrid, setDraggingGrid] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const gridSize = Math.floor(Math.min(img.naturalWidth, img.naturalHeight) * 0.4);
      const gridX = Math.floor((img.naturalWidth - gridSize) / 2);
      const gridY = Math.floor((img.naturalHeight - gridSize) / 2);
      const colors = extractColors(img, gridX, gridY, gridSize);
      setFaces((prev) => {
        const next = [...prev];
        next[activeFace] = { imgUrl: url, colors, gridX, gridY, gridSize };
        return next;
      });
    };
    img.src = url;
    e.target.value = '';
  }

  function extractColors(img: HTMLImageElement, gridX: number, gridY: number, gridSize: number): Color[] {
    const canvas = canvasRef.current!;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const cellSize = Math.floor(gridSize / 3);
    return Array.from({ length: 9 }, (_, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      if (row === 1 && col === 1) return FACE_CENTERS[activeFace];
      const cx = gridX + col * cellSize + Math.floor(cellSize / 2);
      const cy = gridY + row * cellSize + Math.floor(cellSize / 2);
      return sampleRegion(ctx, cx, cy, 20, 20);
    });
  }

  function handleGridDragStart(e: React.MouseEvent, faceIndex: number) {
    e.preventDefault();
    const face = faces[faceIndex];
    if (!face) return;
    setDraggingGrid(true);
    setDragStart({ x: e.clientX - face.gridX, y: e.clientY - face.gridY });
  }

  function handleGridDragMove(e: React.MouseEvent, faceIndex: number) {
    if (!draggingGrid) return;
    const face = faces[faceIndex];
    if (!face) return;
    const img = imgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const scaleX = (img.naturalWidth || rect.width) / rect.width;
    const scaleY = (img.naturalHeight || rect.height) / rect.height;

    const newX = Math.max(0, Math.min(
      face.imgUrl ? (img.naturalWidth - face.gridSize) : rect.width,
      (e.clientX - rect.left) * scaleX - dragStart.x
    ));
    const newY = Math.max(0, Math.min(
      face.imgUrl ? (img.naturalHeight - face.gridSize) : rect.height,
      (e.clientY - rect.top) * scaleY - dragStart.y
    ));

    setFaces((prev) => {
      const next = [...prev];
      const f = next[faceIndex];
      if (!f) return next;
      next[faceIndex] = { ...f, gridX: newX, gridY: newY };
      return next;
    });
  }

  function handleGridDragEnd(faceIndex: number) {
    if (!draggingGrid) return;
    setDraggingGrid(false);
    const face = faces[faceIndex];
    if (!face || !imgRef.current) return;
    // Re-extract colors with new grid position
    const img = new Image();
    img.onload = () => {
      const colors = extractColorsFromLoaded(img, face.gridX, face.gridY, face.gridSize, faceIndex);
      setFaces((prev) => {
        const next = [...prev];
        if (next[faceIndex]) next[faceIndex] = { ...next[faceIndex]!, colors };
        return next;
      });
    };
    img.src = face.imgUrl;
  }

  function extractColorsFromLoaded(img: HTMLImageElement, gridX: number, gridY: number, gridSize: number, faceIdx: number): Color[] {
    const canvas = canvasRef.current!;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const cellSize = Math.floor(gridSize / 3);
    return Array.from({ length: 9 }, (_, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      if (row === 1 && col === 1) return FACE_CENTERS[faceIdx];
      const cx = gridX + col * cellSize + Math.floor(cellSize / 2);
      const cy = gridY + row * cellSize + Math.floor(cellSize / 2);
      return sampleRegion(ctx, cx, cy, 20, 20);
    });
  }

  function handleCorrectCell(faceIndex: number, cellIdx: number) {
    setFaces((prev) => {
      const next = [...prev];
      const f = next[faceIndex];
      if (!f) return next;
      const colors = [...f.colors] as Color[];
      colors[cellIdx] = ((colors[cellIdx] + 1) % 6) as Color;
      next[faceIndex] = { ...f, colors };
      return next;
    });
  }

  function handleFinish() {
    if (faces.some((f) => !f)) return;
    const state: Color[] = new Array(54);
    for (let f = 0; f < 6; f++) {
      const colors = faces[f]!.colors;
      for (let i = 0; i < 9; i++) state[f * 9 + i] = colors[i];
    }
    const { valid, errors } = validate(state as CubeState);
    if (valid) {
      onComplete(state as CubeState);
    } else {
      setValidationErrors(errors);
    }
  }

  const allUploaded = faces.every((f) => f !== null);
  const currentFace = faces[activeFace];

  return (
    <div className="flex flex-col gap-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Face selector tabs */}
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
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'
            )}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: COLOR_HEX[FACE_CENTERS[i]] }}
            />
            {FACE_NAMES[i]}
          </button>
        ))}
      </div>

      {/* Upload area for current face */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-400">{FACE_LABELS[activeFace]}</p>

        {currentFace ? (
          <div className="relative select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
              ref={imgRef}
              src={currentFace.imgUrl}
              alt="Uploaded face"
              className="w-full rounded-lg"
              draggable={false}
            />
            {/* SVG grid overlay */}
            <svg
              className="absolute inset-0 w-full h-full cursor-move"
              viewBox={`0 0 ${imgRef.current?.naturalWidth || 640} ${imgRef.current?.naturalHeight || 480}`}
              onMouseDown={(e) => handleGridDragStart(e, activeFace)}
              onMouseMove={(e) => handleGridDragMove(e, activeFace)}
              onMouseUp={() => handleGridDragEnd(activeFace)}
              onMouseLeave={() => setDraggingGrid(false)}
            >
              <rect
                x={currentFace.gridX}
                y={currentFace.gridY}
                width={currentFace.gridSize}
                height={currentFace.gridSize}
                fill="rgba(255,255,255,0.05)"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="2"
              />
              {[1, 2].map((r) => (
                <line
                  key={`h${r}`}
                  x1={currentFace.gridX}
                  y1={currentFace.gridY + (r * currentFace.gridSize) / 3}
                  x2={currentFace.gridX + currentFace.gridSize}
                  y2={currentFace.gridY + (r * currentFace.gridSize) / 3}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="1.5"
                />
              ))}
              {[1, 2].map((c) => (
                <line
                  key={`v${c}`}
                  x1={currentFace.gridX + (c * currentFace.gridSize) / 3}
                  y1={currentFace.gridY}
                  x2={currentFace.gridX + (c * currentFace.gridSize) / 3}
                  y2={currentFace.gridY + currentFace.gridSize}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="1.5"
                />
              ))}
            </svg>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center h-32 bg-gray-800/50 border-2 border-dashed border-gray-600 hover:border-gray-400 rounded-xl cursor-pointer transition-colors">
            <span className="text-2xl mb-1">📷</span>
            <span className="text-sm text-gray-400">Click to upload photo</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}

        {currentFace && (
          <div className="flex gap-2">
            <label className="flex-1 py-2 text-center bg-gray-700 hover:bg-gray-600 rounded-lg text-sm cursor-pointer transition-colors">
              Replace Photo
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        )}
      </div>

      {/* Detected colors preview with cell correction */}
      {currentFace && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Detected colors (tap cell to cycle):</p>
          <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: 'repeat(3, 2.5rem)' }}>
            {currentFace.colors.map((color, i) => {
              const isCenter = i === 4;
              return (
                <button
                  key={i}
                  onClick={() => !isCenter && handleCorrectCell(activeFace, i)}
                  disabled={isCenter}
                  className={clsx(
                    'w-10 h-10 rounded border-2 transition-transform',
                    isCenter
                      ? 'border-gray-400 cursor-default opacity-80'
                      : 'border-gray-600 hover:border-white hover:scale-110 cursor-pointer'
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
        </div>
      )}

      {/* Finish button */}
      <button
        onClick={handleFinish}
        disabled={!allUploaded}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors"
      >
        {allUploaded ? 'Use These Colors' : `Upload all 6 faces (${faces.filter(Boolean).length}/6 done)`}
      </button>
    </div>
  );
}
