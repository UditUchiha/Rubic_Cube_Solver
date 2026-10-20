'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLOR_HEX } from '@/lib/cubeState';
import { useReducedMotion } from '@/lib/useReducedMotion';

const COUNT = 28;
const SPREAD_X = 24;
const SPREAD_Y = 16;
const CLEAR_X = 3.5;

/*
 * Drifting cubies in the cube's six colours. One InstancedMesh, so the whole
 * field is a single draw call however many there are.
 */
function Field({ animate }: { animate: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cubies = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        position: new THREE.Vector3(
          // Kept out of the centre column, where the headline and hero cube sit.
          (i % 2 ? 1 : -1) * (CLEAR_X + Math.random() * (SPREAD_X / 2 - CLEAR_X)),
          (Math.random() - 0.5) * SPREAD_Y,
          -3 - Math.random() * 9
        ),
        rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
        spin: (Math.random() - 0.5) * 0.5,
        rise: 0.15 + Math.random() * 0.3,
        scale: 0.35 + Math.random() * 0.45,
        color: new THREE.Color(COLOR_HEX[i % 6]),
      })),
    []
  );

  const place = () => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cubies.forEach((c, i) => {
      dummy.position.copy(c.position);
      dummy.rotation.copy(c.rotation);
      dummy.scale.setScalar(c.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    cubies.forEach((c, i) => meshRef.current?.setColorAt(i, c.color));
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cubies]);

  useFrame((_, delta) => {
    if (!animate) return;
    for (const c of cubies) {
      c.rotation.x += c.spin * delta;
      c.rotation.y += c.spin * 0.7 * delta;
      c.position.y += c.rise * delta;
      if (c.position.y > SPREAD_Y / 2 + 1) c.position.y = -SPREAD_Y / 2 - 1; // wrap to the bottom
    }
    place();
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.45} transparent opacity={0.38} />
    </instancedMesh>
  );
}

/** Full-viewport decorative background. Sits behind later siblings, ignores pointers. */
export default function CubeField() {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <Canvas
        // Decorative, so trade sharpness for battery on high-density screens.
        dpr={[1, 1.5]}
        frameloop={reduced ? 'demand' : 'always'}
        camera={{ position: [0, 0, 8], fov: 55 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 6, 8]} intensity={1.2} />
        <Field animate={!reduced} />
      </Canvas>
    </div>
  );
}
