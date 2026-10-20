'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CubeState, COLOR_HEX, createSolvedState } from '@/lib/cubeState';

interface Props {
  state?: CubeState;
  /** Layers per side: 3 for a 3x3, 2 for a 2x2. `state` holds 6 x layers^2 cells. */
  layers?: number;
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
}

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
 * position (0..n-1 on each axis). Row/column here match the cell layout: on U,
 * row 0 is the back row; on every side face, row 0 is the top row and column 0
 * is the left edge as seen from outside that face.
 */
const STICKER_FACES: {
  key: string;
  face: number;
  visible: (p: Pos, n: number) => boolean;
  cell: (p: Pos, n: number) => number;
  position: [number, number, number];
  rotation: [number, number, number];
}[] = [
  {
    key: 'U', face: 0,
    visible: ({ y }, n) => y === n - 1,
    cell: ({ x, z }, n) => z * n + x,
    position: [0, STICKER_OFFSET, 0],
    rotation: [-Math.PI / 2, 0, 0],
  },
  {
    key: 'D', face: 5,
    visible: ({ y }) => y === 0,
    cell: ({ x, z }, n) => (n - 1 - z) * n + x,
    position: [0, -STICKER_OFFSET, 0],
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    key: 'F', face: 2,
    visible: ({ z }, n) => z === n - 1,
    cell: ({ x, y }, n) => (n - 1 - y) * n + x,
    position: [0, 0, STICKER_OFFSET],
    rotation: [0, 0, 0],
  },
  {
    key: 'B', face: 4,
    visible: ({ z }) => z === 0,
    cell: ({ x, y }, n) => (n - 1 - y) * n + (n - 1 - x),
    position: [0, 0, -STICKER_OFFSET],
    rotation: [0, Math.PI, 0],
  },
  {
    key: 'L', face: 1,
    visible: ({ x }) => x === 0,
    cell: ({ y, z }, n) => (n - 1 - y) * n + z,
    position: [-STICKER_OFFSET, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    key: 'R', face: 3,
    visible: ({ x }, n) => x === n - 1,
    cell: ({ y, z }, n) => (n - 1 - y) * n + (n - 1 - z),
    position: [STICKER_OFFSET, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },
];

function Cubie({
  pos, n, state, res,
}: {
  pos: Pos; n: number; state: CubeState; res: Resources;
}) {
  const mid = (n - 1) / 2;

  return (
    <group position={[(pos.x - mid) * CUBIE_SPACING, (pos.y - mid) * CUBIE_SPACING, (pos.z - mid) * CUBIE_SPACING]}>
      <mesh geometry={res.cubieGeometry} material={res.cubieMaterial} />
      {STICKER_FACES.map((sf) =>
        sf.visible(pos, n) ? (
          <mesh
            key={sf.key}
            geometry={res.stickerGeometry}
            material={res.stickerMaterials[state[sf.face * n * n + sf.cell(pos, n)]]}
            position={sf.position}
            rotation={sf.rotation}
          />
        ) : null
      )}
    </group>
  );
}

type CubieFilter = (pos: Pos, n: number) => boolean;

/*
 * Rotation axis and signed angle for each move, matching the move engine in
 * cubeState.ts. Three.js is right-handed, so a clockwise turn seen from outside
 * a face is a negative rotation about that face's outward axis for U, R and F,
 * and a positive one for D, L and B.
 */
const MOVE_DEFS: Record<string, { axis: 'x' | 'y' | 'z'; angle: number; filter: CubieFilter }> = {
  'U':  { axis: 'y', angle: -Math.PI / 2, filter: ({ y }, n) => y === n - 1 },
  "U'": { axis: 'y', angle:  Math.PI / 2, filter: ({ y }, n) => y === n - 1 },
  'U2': { axis: 'y', angle: -Math.PI,     filter: ({ y }, n) => y === n - 1 },
  'D':  { axis: 'y', angle:  Math.PI / 2, filter: ({ y }) => y === 0 },
  "D'": { axis: 'y', angle: -Math.PI / 2, filter: ({ y }) => y === 0 },
  'D2': { axis: 'y', angle:  Math.PI,     filter: ({ y }) => y === 0 },
  'R':  { axis: 'x', angle: -Math.PI / 2, filter: ({ x }, n) => x === n - 1 },
  "R'": { axis: 'x', angle:  Math.PI / 2, filter: ({ x }, n) => x === n - 1 },
  'R2': { axis: 'x', angle: -Math.PI,     filter: ({ x }, n) => x === n - 1 },
  'L':  { axis: 'x', angle:  Math.PI / 2, filter: ({ x }) => x === 0 },
  "L'": { axis: 'x', angle: -Math.PI / 2, filter: ({ x }) => x === 0 },
  'L2': { axis: 'x', angle:  Math.PI,     filter: ({ x }) => x === 0 },
  'F':  { axis: 'z', angle: -Math.PI / 2, filter: ({ z }, n) => z === n - 1 },
  "F'": { axis: 'z', angle:  Math.PI / 2, filter: ({ z }, n) => z === n - 1 },
  'F2': { axis: 'z', angle: -Math.PI,     filter: ({ z }, n) => z === n - 1 },
  'B':  { axis: 'z', angle:  Math.PI / 2, filter: ({ z }) => z === 0 },
  "B'": { axis: 'z', angle: -Math.PI / 2, filter: ({ z }) => z === 0 },
  'B2': { axis: 'z', angle:  Math.PI,     filter: ({ z }) => z === 0 },
};

// Every cubie on the surface; the hidden core is never drawn.
function surfaceCubies(n: number): Pos[] {
  const positions: Pos[] = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++)
        if ([x, y, z].some((c) => c === 0 || c === n - 1)) positions.push({ x, y, z });
  return positions;
}

function CubeContent({
  state, layers, move, animDuration, onMoveComplete, autoRotate, autoRotateSpeed,
}: {
  state: CubeState;
  layers: number;
  move: string | null;
  animDuration: number;
  onMoveComplete: () => void;
  autoRotate: boolean;
  autoRotateSpeed: number;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const layerRef = useRef<THREE.Group>(null);
  const [animStart, setAnimStart] = useState<number | null>(null);
  const res = useCubeResources();
  const cubies = useMemo(() => surfaceCubies(layers), [layers]);

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
  const turning = cubies.filter((p) => def?.filter(p, layers));
  const still = cubies.filter((p) => !def?.filter(p, layers));

  const render = (p: Pos) => (
    <Cubie key={`${p.x}${p.y}${p.z}`} pos={p} n={layers} state={state} res={res} />
  );

  return (
    // A fixed tilt reads as a cube rather than a flat grid of squares.
    // Scaled so every size fills the same space as a 3x3.
    <group ref={spinRef} rotation={[0.18, 0.5, 0]} scale={3 / layers}>
      <group ref={layerRef}>{turning.map(render)}</group>
      <group>{still.map(render)}</group>
    </group>
  );
}

export default function RubiksCube3D({
  state = createSolvedState(),
  layers = 3,
  size = 300,
  fill = false,
  autoRotate = false,
  autoRotateSpeed = 24,
  interactive = false,
  move = null,
  animDuration = 400,
  onMoveComplete = () => {},
}: Props) {
  const wrapperStyle: React.CSSProperties = fill
    ? { width: '100%', height: '100%' }
    : { width: size, height: size, margin: '0 auto' };

  return (
    <div
      style={{ ...wrapperStyle, cursor: interactive ? 'grab' : 'default', touchAction: 'pan-y' }}
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
          layers={layers}
          move={move}
          animDuration={animDuration}
          onMoveComplete={onMoveComplete}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
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
