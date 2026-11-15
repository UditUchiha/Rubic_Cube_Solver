import type { Metadata } from 'next';
import CubeStage from '@/components/CubeStage';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description:
    "Turn the cube, press Solve, and watch it solve itself in your browser. Or paint, scan or photograph your own scrambled cube.",
};

export default function Home() {
  return <CubeStage />;
}
