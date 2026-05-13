'use client';

import { CubeState, Color, Face, COLOR_HEX, createSolvedState, idx } from '@/lib/cubeState';
import { useRef, useEffect, useState } from 'react';

interface Props {
  state?: CubeState;
  size?: number;
  autoRotate?: boolean;
  move?: string | null;
  animDuration?: number;
  onMoveComplete?: () => void;
}

// Face transforms: position each of the 6 faces in 3D
const FACE_TRANSFORMS = [
  'rotateX(90deg) translateZ(var(--half))',   // UP
  'rotateY(-90deg) translateZ(var(--half))',  // LEFT
  'translateZ(var(--half))',                   // FRONT
  'rotateY(90deg) translateZ(var(--half))',   // RIGHT
  'rotateY(180deg) translateZ(var(--half))',  // BACK
  'rotateX(-90deg) translateZ(var(--half))',  // DOWN
];

// BACK face stickers appear mirrored; reverse columns to compensate
const FACE_MIRROR = [false, false, false, false, true, false];

// Pre-rotation for each move (applied in scene space before face's own transform)
const MOVE_ANIM: Record<string, { faceIdx: number; axis: 'X' | 'Y' | 'Z'; targetAngle: number }> = {
  'U':  { faceIdx: 0, axis: 'Y', targetAngle:   90 },
  "U'": { faceIdx: 0, axis: 'Y', targetAngle:  -90 },
  'U2': { faceIdx: 0, axis: 'Y', targetAngle:  180 },
  'L':  { faceIdx: 1, axis: 'X', targetAngle:  -90 },
  "L'": { faceIdx: 1, axis: 'X', targetAngle:   90 },
  'L2': { faceIdx: 1, axis: 'X', targetAngle:  180 },
  'F':  { faceIdx: 2, axis: 'Z', targetAngle:   90 },
  "F'": { faceIdx: 2, axis: 'Z', targetAngle:  -90 },
  'F2': { faceIdx: 2, axis: 'Z', targetAngle:  180 },
  'R':  { faceIdx: 3, axis: 'X', targetAngle:   90 },
  "R'": { faceIdx: 3, axis: 'X', targetAngle:  -90 },
  'R2': { faceIdx: 3, axis: 'X', targetAngle:  180 },
  'B':  { faceIdx: 4, axis: 'Z', targetAngle:  -90 },
  "B'": { faceIdx: 4, axis: 'Z', targetAngle:   90 },
  'B2': { faceIdx: 4, axis: 'Z', targetAngle:  180 },
  'D':  { faceIdx: 5, axis: 'Y', targetAngle:  -90 },
  "D'": { faceIdx: 5, axis: 'Y', targetAngle:   90 },
  'D2': { faceIdx: 5, axis: 'Y', targetAngle:  180 },
};

export default function RubiksCube3D({
  state,
  size = 150,
  autoRotate = false,
  move = null,
  animDuration = 350,
  onMoveComplete,
}: Props) {
  const cubeState = state ?? createSolvedState();
  const sceneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const rotation = useRef({ x: -25, y: 30 });
  const animFrameRef = useRef<number | null>(null);

  // Face animation state
  const [animFace, setAnimFace] = useState<number | null>(null);
  const [animAngle, setAnimAngle] = useState(0);
  const [hasTransition, setHasTransition] = useState(false);
  const prevMoveRef = useRef<string | null>(null);

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

  // Trigger face animation when move prop changes
  useEffect(() => {
    if (!move || move === prevMoveRef.current) return;
    prevMoveRef.current = move;
    const anim = MOVE_ANIM[move];
    if (!anim) { onMoveComplete?.(); return; }

    setAnimFace(anim.faceIdx);
    setHasTransition(false);
    setAnimAngle(0);

    // Double-RAF: first frame sets angle=0, second enables transition + sets target
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setHasTransition(true);
        setAnimAngle(anim.targetAngle);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [move]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTransitionEnd(faceIdx: number) {
    if (animFace !== faceIdx) return;
    // Disable transition first so the angle-reset snap is invisible
    setHasTransition(false);
    setAnimAngle(0);
    setAnimFace(null);
    prevMoveRef.current = null;
    onMoveComplete?.();
  }

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

  function onPointerUp() { dragging.current = false; }

  function onTouchStart(e: React.TouchEvent) {
    if (autoRotate || e.touches.length === 0) return;
    dragging.current = true;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current || e.touches.length === 0) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    rotation.current.y += dx * 0.5;
    rotation.current.x -= dy * 0.5;
    rotation.current.x = Math.max(-80, Math.min(80, rotation.current.x));
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    applyRotation();
  }

  function onTouchEnd() { dragging.current = false; }

  function getFaceTransform(faceIdx: number): string {
    const base = FACE_TRANSFORMS[faceIdx];
    if (animFace !== faceIdx || !move) return base;
    const anim = MOVE_ANIM[move];
    if (!anim) return base;
    return `rotate${anim.axis}(${animAngle}deg) ${base}`;
  }

  return (
    <div
      style={{
        width: faceSize + 40,
        height: faceSize + 40,
        perspective: '600px',
        cursor: autoRotate ? 'default' : 'grab',
        touchAction: 'none',
      }}
      className="flex items-center justify-center select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
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
        {FACE_TRANSFORMS.map((_, faceIdx) => {
          const mirror = FACE_MIRROR[faceIdx];
          const isAnimatingFace = animFace === faceIdx;
          return (
            <div
              key={faceIdx}
              style={{
                position: 'absolute',
                width: faceSize,
                height: faceSize,
                transform: getFaceTransform(faceIdx),
                transition: isAnimatingFace && hasTransition
                  ? `transform ${animDuration}ms ease`
                  : 'none',
                transformStyle: 'preserve-3d',
                display: 'grid',
                gridTemplateColumns: `repeat(3, ${stickerSize}px)`,
                gap: `${gap}px`,
                padding: `${gap}px`,
                backgroundColor: '#111',
                borderRadius: 4,
                backfaceVisibility: 'hidden',
              }}
              onTransitionEnd={() => handleTransitionEnd(faceIdx)}
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
