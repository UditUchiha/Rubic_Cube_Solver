'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CubeState, COLOR_HEX, createSolvedState } from '@/lib/cubeState';

interface Props {
  state?: CubeState;
  size?: number;
  autoRotate?: boolean;
  move?: string | null;
  animDuration?: number;
  onMoveComplete?: () => void;
}

// Map internal color indices to hex
const FACE_COLORS = [
  COLOR_HEX[0], // U: White
  COLOR_HEX[1], // L: Green
  COLOR_HEX[2], // F: Red
  COLOR_HEX[3], // R: Blue
  COLOR_HEX[4], // B: Orange
  COLOR_HEX[5], // D: Yellow
];

/**
 * Sticker component: a small plane positioned on one of the 6 faces of a cubie.
 */
function Sticker({ color, position, rotation }: { color: string; position: [number, number, number]; rotation: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.85, 0.85]} />
      <meshStandardMaterial color={color} roughness={0.1} metalness={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Single Cubie component (one of the 27 blocks).
 */
function Cubie({ x, y, z, state }: { x: number; y: number; z: number; state: CubeState }) {
  const stickers = [];

  // UP face (+Y)
  if (y === 1) {
    const r = z + 1, c = x + 1;
    stickers.push(
      <Sticker 
        key="U" 
        color={FACE_COLORS[state[0 * 9 + r * 3 + c]]} 
        position={[0, 0.51, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
      />
    );
  }
  // DOWN face (-Y)
  if (y === -1) {
    const r = 1 - z, c = x + 1;
    stickers.push(
      <Sticker 
        key="D" 
        color={FACE_COLORS[state[5 * 9 + r * 3 + c]]} 
        position={[0, -0.51, 0]} 
        rotation={[Math.PI / 2, 0, 0]} 
      />
    );
  }
  // FRONT face (+Z)
  if (z === 1) {
    const r = 1 - y, c = x + 1;
    stickers.push(
      <Sticker 
        key="F" 
        color={FACE_COLORS[state[2 * 9 + r * 3 + c]]} 
        position={[0, 0, 0.51]} 
        rotation={[0, 0, 0]} 
      />
    );
  }
  // BACK face (-Z)
  if (z === -1) {
    const r = 1 - y, c = 1 - x;
    stickers.push(
      <Sticker 
        key="B" 
        color={FACE_COLORS[state[4 * 9 + r * 3 + c]]} 
        position={[0, 0, -0.51]} 
        rotation={[0, Math.PI, 0]} 
      />
    );
  }
  // LEFT face (-X)
  if (x === -1) {
    const r = 1 - y, c = z + 1;
    stickers.push(
      <Sticker 
        key="L" 
        color={FACE_COLORS[state[1 * 9 + r * 3 + c]]} 
        position={[-0.51, 0, 0]} 
        rotation={[0, -Math.PI / 2, 0]} 
      />
    );
  }
  // RIGHT face (+X)
  if (x === 1) {
    const r = 1 - y, c = 1 - z;
    stickers.push(
      <Sticker 
        key="R" 
        color={FACE_COLORS[state[3 * 9 + r * 3 + c]]} 
        position={[0.51, 0, 0]} 
        rotation={[0, Math.PI / 2, 0]} 
      />
    );
  }

  return (
    <group position={[x * 1.05, y * 1.05, z * 1.05]}>
      {/* The black plastic "core" of the cubie */}
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#050505" roughness={0.5} />
      </mesh>
      {stickers}
    </group>
  );
}

const MOVE_DEFS: Record<string, { axis: 'x' | 'y' | 'z'; angle: number; filter: (x: number, y: number, z: number) => boolean }> = {
  'U':  { axis: 'y', angle: -Math.PI / 2, filter: (x, y, z) => y === 1 },
  "U'": { axis: 'y', angle:  Math.PI / 2, filter: (x, y, z) => y === 1 },
  'U2': { axis: 'y', angle: -Math.PI,     filter: (x, y, z) => y === 1 },
  'D':  { axis: 'y', angle:  Math.PI / 2, filter: (x, y, z) => y === -1 },
  "D'": { axis: 'y', angle: -Math.PI / 2, filter: (x, y, z) => y === -1 },
  'D2': { axis: 'y', angle:  Math.PI,     filter: (x, y, z) => y === -1 },
  'R':  { axis: 'x', angle: -Math.PI / 2, filter: (x, y, z) => x === 1 },
  "R'": { axis: 'x', angle:  Math.PI / 2, filter: (x, y, z) => x === 1 },
  'R2': { axis: 'x', angle: -Math.PI,     filter: (x, y, z) => x === 1 },
  'L':  { axis: 'x', angle:  Math.PI / 2, filter: (x, y, z) => x === -1 },
  "L'": { axis: 'x', angle: -Math.PI / 2, filter: (x, y, z) => x === -1 },
  'L2': { axis: 'x', angle:  Math.PI,     filter: (x, y, z) => x === -1 },
  'F':  { axis: 'z', angle: -Math.PI / 2, filter: (x, y, z) => z === 1 },
  "F'": { axis: 'z', angle:  Math.PI / 2, filter: (x, y, z) => z === 1 },
  'F2': { axis: 'z', angle: -Math.PI,     filter: (x, y, z) => z === 1 },
  'B':  { axis: 'z', angle:  Math.PI / 2, filter: (x, y, z) => z === -1 },
  "B'": { axis: 'z', angle: -Math.PI / 2, filter: (x, y, z) => z === -1 },
  'B2': { axis: 'z', angle:  Math.PI,     filter: (x, y, z) => z === -1 },
};

function CubeContent({ state, move, animDuration, onMoveComplete }: { state: CubeState; move: string | null; animDuration: number; onMoveComplete: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const [animStart, setAnimStart] = useState<number | null>(null);

  useEffect(() => {
    if (move && MOVE_DEFS[move]) {
      setAnimStart(performance.now());
    } else {
      setAnimStart(null);
      if (groupRef.current) groupRef.current.rotation.set(0, 0, 0);
    }
  }, [move]);

  useFrame(() => {
    if (animStart !== null && move && groupRef.current) {
      const def = MOVE_DEFS[move];
      const elapsed = performance.now() - animStart;
      const progress = Math.min(elapsed / animDuration, 1.0);
      const eased = 1 - Math.pow(1 - progress, 3); // Cubic out
      
      groupRef.current.rotation.set(0, 0, 0);
      groupRef.current.rotation[def.axis] = def.angle * eased;

      if (progress >= 1.0) {
        setAnimStart(null);
        onMoveComplete();
      }
    }
  });

  const cubies = [];
  const def = move ? MOVE_DEFS[move] : null;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const animated = !!(def && def.filter(x, y, z));
        const cubie = <Cubie key={`${x}${y}${z}`} x={x} y={y} z={z} state={state} />;
        cubies.push({ animated, cubie });
      }
    }
  }

  return (
    <group>
      <group ref={groupRef}>
        {cubies.filter(c => c.animated).map(c => c.cubie)}
      </group>
      <group>
        {cubies.filter(c => !c.animated).map(c => c.cubie)}
      </group>
    </group>
  );
}

export default function RubiksCube3D({
  state = createSolvedState(),
  size = 300,
  autoRotate = false,
  move = null,
  animDuration = 400,
  onMoveComplete = () => {},
}: Props) {
  return (
    <div style={{ width: size, height: size, margin: '0 auto', cursor: 'grab' }}>
      <Canvas camera={{ position: [4, 4, 5], fov: 45 }} shadows>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        <CubeContent state={state} move={move} animDuration={animDuration} onMoveComplete={onMoveComplete} />
        
        <OrbitControls enablePan={false} enableZoom={false} autoRotate={autoRotate && !move} />
      </Canvas>
    </div>
  );
}
