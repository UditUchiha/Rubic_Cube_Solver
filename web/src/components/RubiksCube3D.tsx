'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CubeState, COLOR_HEX, createSolvedState, cubeSize } from '@/lib/cubeState';

interface Props {
  state?: CubeState;
  /** Rendered size in px. Omit and pass `fill` to size from the parent instead. */
  size?: number;
  /** Stretch to fill the parent element rather than using a fixed pixel size. */
  fill?: boolean;
  autoRotate?: boolean;
  /** Degrees per second for the idle spin. */
  autoRotateSpeed?: number;
  /** Allow drag-to-orbit. Off by default so decorative cubes don't trap scroll. */
  interactive?: boolean;
  move?: string | null;
  animDuration?: number;
  onMoveComplete?: () => void;
  /** Called with the 0-53 state index of a clicked sticker. Drags don't count. */
  onStickerClick?: (index: number) => void;
}

// Pointer travel in px under which a press counts as a click, not a drag to orbit.
const CLICK_SLOP = 5;

// Internal colour index -> hex. Index order is U, L, F, R, B, D.
const FACE_COLORS = [
  COLOR_HEX[0], // White
  COLOR_HEX[1], // Green
  COLOR_HEX[2], // Red
  COLOR_HEX[3], // Blue
  COLOR_HEX[4], // Orange
  COLOR_HEX[5], // Yellow
];

const CUBIE_SPACING = 1.05;
const STICKER_OFFSET = 0.5005; // just clear of the cubie face, avoids z-fighting

/*
 * One rounded-square sticker geometry and one material per colour, shared by
 * all 54 stickers. Previously every sticker built its own PlaneGeometry and
 * MeshStandardMaterial and every cubie its own BoxGeometry, so a cube was ~80
 * geometries and ~80 materials — all rebuilt whenever the state changed, which
 * on the solution player is once per move.
 */
function useCubeResources() {
  const resources = useMemo(() => {
    const size = 0.86;
    const radius = 0.13;
    const half = size / 2;
    const inner = half - radius;

    const shape = new THREE.Shape();
    shape.moveTo(-inner, -half);
    shape.lineTo(inner, -half);
    shape.quadraticCurveTo(half, -half, half, -inner);
    shape.lineTo(half, inner);
    shape.quadraticCurveTo(half, half, inner, half);
    shape.lineTo(-inner, half);
    shape.quadraticCurveTo(-half, half, -half, inner);
    shape.lineTo(-half, -inner);
    shape.quadraticCurveTo(-half, -half, -inner, -half);

    const stickerGeometry = new THREE.ShapeGeometry(shape, 6);
    const cubieGeometry = new THREE.BoxGeometry(1, 1, 1);

    const stickerMaterials = FACE_COLORS.map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.38,
          metalness: 0.02,
          side: THREE.DoubleSide,
        })
    );

    const cubieMaterial = new THREE.MeshStandardMaterial({
      color: '#0b0b10',
      roughness: 0.75,
      metalness: 0.05,
    });

    return { stickerGeometry, cubieGeometry, stickerMaterials, cubieMaterial };
  }, []);

  // Three.js resources are not garbage collected; release them with the cube.
  useEffect(() => {
    return () => {
      resources.stickerGeometry.dispose();
      resources.cubieGeometry.dispose();
      resources.stickerMaterials.forEach((m) => m.dispose());
      resources.cubieMaterial.dispose();
    };
  }, [resources]);

  return resources;
}

type Resources = ReturnType<typeof useCubeResources>;

type Pos = { x: number; y: number; z: number };

/*
 * Which sticker of which face a cubie shows, as a function of its grid
 * position. Coordinates run from -h to h, where h = (n-1)/2 (1 on a 3x3, 0.5
 * on a 2x2). Row/column match the state layout: on U, row 0 is the back row;
 * on every side face, row 0 is the top row and column 0 is the left edge as
 * seen from outside that face.
 */
const STICKER_FACES: {
  key: string;
  face: number;
  visible: (p: Pos, h: number) => boolean;
  /* row * n + col within the face */
  cell: (p: Pos, h: number, n: number) => number;
  position: [number, number, number];
  rotation: [number, number, number];
}[] = [
  {
    key: 'U', face: 0,
    visible: ({ y }, h) => y === h,
    cell: ({ x, z }, h, n) => (z + h) * n + (x + h),
    position: [0, STICKER_OFFSET, 0],
    rotation: [-Math.PI / 2, 0, 0],
  },
  {
    key: 'D', face: 5,
    visible: ({ y }, h) => y === -h,
    cell: ({ x, z }, h, n) => (h - z) * n + (x + h),
    position: [0, -STICKER_OFFSET, 0],
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    key: 'F', face: 2,
    visible: ({ z }, h) => z === h,
    cell: ({ x, y }, h, n) => (h - y) * n + (x + h),
    position: [0, 0, STICKER_OFFSET],
    rotation: [0, 0, 0],
  },
  {
    key: 'B', face: 4,
    visible: ({ z }, h) => z === -h,
    cell: ({ x, y }, h, n) => (h - y) * n + (h - x),
    position: [0, 0, -STICKER_OFFSET],
    rotation: [0, Math.PI, 0],
  },
  {
    key: 'L', face: 1,
    visible: ({ x }, h) => x === -h,
    cell: ({ y, z }, h, n) => (h - y) * n + (z + h),
    position: [-STICKER_OFFSET, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    key: 'R', face: 3,
    visible: ({ x }, h) => x === h,
    cell: ({ y, z }, h, n) => (h - y) * n + (h - z),
    position: [STICKER_OFFSET, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },
];

function Cubie({
  x, y, z, n, state, res, onStickerClick,
}: {
  x: number; y: number; z: number; n: number; state: CubeState; res: Resources;
  onStickerClick?: (index: number) => void;
}) {
  const pos = { x, y, z };
  const h = (n - 1) / 2;

  return (
    <group position={[x * CUBIE_SPACING, y * CUBIE_SPACING, z * CUBIE_SPACING]}>
      <mesh
        geometry={res.cubieGeometry}
        material={res.cubieMaterial}
        // The plastic swallows clicks too, or a click in the gap between
        // stickers would carry on through the cube and paint the far side.
        onClick={onStickerClick && ((e) => e.stopPropagation())}
      />
      {STICKER_FACES.map((sf) =>
        sf.visible(pos, h) ? (
          <mesh
            key={sf.key}
            geometry={res.stickerGeometry}
            material={res.stickerMaterials[state[sf.face * n * n + sf.cell(pos, h, n)]]}
            position={sf.position}
            rotation={sf.rotation}
            onClick={onStickerClick && ((e) => {
              e.stopPropagation(); // only the front-most sticker under the pointer
              if (e.delta <= CLICK_SLOP) onStickerClick(sf.face * n * n + sf.cell(pos, h, n));
            })}
          />
        ) : null
      )}
    </group>
  );
}

/*
 * Rotation axis and signed angle for each move, matching the move engine in
 * cubeState.ts. Three.js is right-handed, so a clockwise turn seen from outside
 * a face is a negative rotation about that face's outward axis for U, R and F,
 * and a positive one for D, L and B. `side` picks the outer layer on that axis.
 */
const MOVE_DEFS: Record<string, { axis: 'x' | 'y' | 'z'; angle: number; side: 1 | -1 }> = {
  'U':  { axis: 'y', angle: -Math.PI / 2, side: 1 },
  "U'": { axis: 'y', angle:  Math.PI / 2, side: 1 },
  'U2': { axis: 'y', angle: -Math.PI,     side: 1 },
  'D':  { axis: 'y', angle:  Math.PI / 2, side: -1 },
  "D'": { axis: 'y', angle: -Math.PI / 2, side: -1 },
  'D2': { axis: 'y', angle:  Math.PI,     side: -1 },
  'R':  { axis: 'x', angle: -Math.PI / 2, side: 1 },
  "R'": { axis: 'x', angle:  Math.PI / 2, side: 1 },
  'R2': { axis: 'x', angle: -Math.PI,     side: 1 },
  'L':  { axis: 'x', angle:  Math.PI / 2, side: -1 },
  "L'": { axis: 'x', angle: -Math.PI / 2, side: -1 },
  'L2': { axis: 'x', angle:  Math.PI,     side: -1 },
  'F':  { axis: 'z', angle: -Math.PI / 2, side: 1 },
  "F'": { axis: 'z', angle:  Math.PI / 2, side: 1 },
  'F2': { axis: 'z', angle: -Math.PI,     side: 1 },
  'B':  { axis: 'z', angle:  Math.PI / 2, side: -1 },
  "B'": { axis: 'z', angle: -Math.PI / 2, side: -1 },
  'B2': { axis: 'z', angle:  Math.PI,     side: -1 },
};

// Every cubie on the surface of an n x n x n cube, centred on the origin.
function cubiePositions(n: number): Pos[] {
  const h = (n - 1) / 2;
  const positions: Pos[] = [];
  for (let x = -h; x <= h; x++)
    for (let y = -h; y <= h; y++)
      for (let z = -h; z <= h; z++)
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === h) positions.push({ x, y, z });
  return positions;
}

function CubeContent({
  state, move, animDuration, onMoveComplete, autoRotate, autoRotateSpeed, onStickerClick,
}: {
  state: CubeState;
  move: string | null;
  animDuration: number;
  onMoveComplete: () => void;
  autoRotate: boolean;
  autoRotateSpeed: number;
  onStickerClick?: (index: number) => void;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const layerRef = useRef<THREE.Group>(null);
  const [animStart, setAnimStart] = useState<number | null>(null);
  const res = useCubeResources();
  const n = cubeSize(state);
  const positions = useMemo(() => cubiePositions(n), [n]);

  useEffect(() => {
    if (move && MOVE_DEFS[move]) {
      setAnimStart(performance.now());
    } else {
      setAnimStart(null);
      if (layerRef.current) layerRef.current.rotation.set(0, 0, 0);
    }
  }, [move]);

  useFrame((_, delta) => {
    // Idle spin, driven here rather than by OrbitControls.autoRotate so it is
    // frame-rate independent, keeps turning while a move plays, and works even
    // when the cube is decorative and ignores pointer events.
    if (autoRotate && spinRef.current) {
      spinRef.current.rotation.y += THREE.MathUtils.degToRad(autoRotateSpeed) * delta;
    }

    if (animStart !== null && move && layerRef.current) {
      const def = MOVE_DEFS[move];
      const progress = Math.min((performance.now() - animStart) / animDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out

      layerRef.current.rotation.set(0, 0, 0);
      layerRef.current.rotation[def.axis] = def.angle * eased;

      if (progress >= 1) {
        setAnimStart(null);
        onMoveComplete();
      }
    }
  });

  const def = move ? MOVE_DEFS[move] : null;
  const inLayer = (p: Pos) => !!def && p[def.axis] === def.side * ((n - 1) / 2);
  const turning = positions.filter(inLayer);
  const still = positions.filter((p) => !inLayer(p));

  const render = (p: Pos) => (
    <Cubie key={`${p.x},${p.y},${p.z}`} x={p.x} y={p.y} z={p.z} n={n} state={state} res={res} onStickerClick={onStickerClick} />
  );

  return (
    // A fixed tilt reads as a cube rather than a flat grid of squares. Scaled
    // so a 2x2 fills the same space as a 3x3.
    <group ref={spinRef} rotation={[0.18, 0.5, 0]} scale={3 / n}>
      <group ref={layerRef}>{turning.map(render)}</group>
      <group>{still.map(render)}</group>
    </group>
  );
}

export default function RubiksCube3D({
  state = createSolvedState(),
  size = 300,
  fill = false,
  autoRotate = false,
  autoRotateSpeed = 24,
  interactive = false,
  move = null,
  animDuration = 400,
  onMoveComplete = () => {},
  onStickerClick,
}: Props) {
  const wrapperStyle: React.CSSProperties = fill
    ? { width: '100%', height: '100%' }
    : { width: size, height: size, margin: '0 auto' };

  return (
    <div
      style={{ ...wrapperStyle, cursor: onStickerClick ? 'pointer' : interactive ? 'grab' : 'default', touchAction: 'pan-y' }}
      role="img"
      aria-label="3D Rubik's Cube"
    >
      <Canvas
        camera={{ position: [3.6, 3.2, 5.2], fov: 42 }}
        // Uncapped device pixel ratio renders 9x the pixels on a 3x phone
        // screen for no visible gain.
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.95} />
        {/* Key, fill and rim: enough separation to read the cube's form. */}
        <directionalLight position={[5, 8, 6]} intensity={1.5} />
        <directionalLight position={[-6, 2, 4]} intensity={0.5} />
        <directionalLight position={[0, -5, -6]} intensity={0.35} />

        <CubeContent
          state={state}
          move={move}
          animDuration={animDuration}
          onMoveComplete={onMoveComplete}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          onStickerClick={onStickerClick}
        />

        {interactive && (
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.6}
          />
        )}
      </Canvas>
    </div>
  );
}
