'use client';

import { CubeState, Color, Face, COLOR_HEX, createSolvedState, idx } from '@/lib/cubeState';
import { useRef, useEffect } from 'react';

interface Props {
  state?: CubeState;
  size?: number;
  autoRotate?: boolean;
}

// Face transforms: [rotateX, rotateY] in degrees, then translateZ
const FACE_TRANSFORMS = [
  'rotateX(90deg) translateZ(var(--half))',  // UP (face 0)
  'rotateY(-90deg) translateZ(var(--half))', // LEFT (face 1)
  'translateZ(var(--half))',                  // FRONT (face 2)
  'rotateY(90deg) translateZ(var(--half))',  // RIGHT (face 3)
  'rotateY(180deg) translateZ(var(--half))', // BACK (face 4)
  'rotateX(-90deg) translateZ(var(--half))', // DOWN (face 5)
];

// For BACK face the stickers appear mirrored, so we need to reverse columns
const FACE_MIRROR = [false, false, false, false, true, false];

export default function RubiksCube3D({ state, size = 150, autoRotate = false }: Props) {
  const cubeState = state ?? createSolvedState();
  const sceneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const rotation = useRef({ x: -25, y: 30 });
  const animFrameRef = useRef<number | null>(null);

  const stickerSize = Math.floor(size / 3.8);
  const gap = Math.floor(stickerSize / 12);
  const faceSize = stickerSize * 3 + gap * 2;
  const half = faceSize / 2;

  function applyRotation() {
    if (sceneRef.current) {
      sceneRef.current.style.transform =
        `rotateX(${rotation.current.x}deg) rotateY(${rotation.current.y}deg)`;
    }
  }

  useEffect(() => {
    applyRotation();
    if (!autoRotate) return;
    let angle = rotation.current.y;
    function tick() {
      angle += 0.3;
      rotation.current.y = angle;
      applyRotation();
      animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [autoRotate]);

  function onPointerDown(e: React.PointerEvent) {
    if (autoRotate) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    rotation.current.y += dx * 0.5;
    rotation.current.x -= dy * 0.5;
    rotation.current.x = Math.max(-80, Math.min(80, rotation.current.x));
    lastPos.current = { x: e.clientX, y: e.clientY };
    applyRotation();
  }

  function onPointerUp() {
    dragging.current = false;
  }

  return (
    <div
      style={{ width: faceSize + 40, height: faceSize + 40, perspective: '600px', cursor: autoRotate ? 'default' : 'grab' }}
      className="flex items-center justify-center select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        ref={sceneRef}
        style={{
          width: faceSize,
          height: faceSize,
          transformStyle: 'preserve-3d',
          position: 'relative',
          ['--half' as string]: `${half}px`,
        }}
      >
        {FACE_TRANSFORMS.map((transform, faceIdx) => {
          const mirror = FACE_MIRROR[faceIdx];
          return (
            <div
              key={faceIdx}
              style={{
                position: 'absolute',
                width: faceSize,
                height: faceSize,
                transform,
                transformStyle: 'preserve-3d',
                display: 'grid',
                gridTemplateColumns: `repeat(3, ${stickerSize}px)`,
                gap: `${gap}px`,
                padding: `${gap}px`,
                backgroundColor: '#111',
                borderRadius: 4,
                backfaceVisibility: 'hidden',
              }}
            >
              {Array.from({ length: 9 }, (_, i) => {
                const row = Math.floor(i / 3);
                const col = mirror ? 2 - (i % 3) : i % 3;
                const color: Color = cubeState[idx(faceIdx as Face, row, col)];
                return (
                  <div
                    key={i}
                    style={{
                      width: stickerSize,
                      height: stickerSize,
                      backgroundColor: COLOR_HEX[color],
                      borderRadius: 3,
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
