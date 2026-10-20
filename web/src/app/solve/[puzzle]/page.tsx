import SolvePage from '@/components/SolvePage';
import { PUZZLES } from '@/lib/puzzles';

// Unknown puzzle ids 404 instead of rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return PUZZLES.map((p) => ({ puzzle: p.id }));
}

export default function Page({ params }: { params: { puzzle: string } }) {
  // Keyed so switching puzzles starts from a fresh state of the right size.
  return <SolvePage key={params.puzzle} puzzleId={params.puzzle} />;
}
