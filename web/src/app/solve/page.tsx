import { redirect } from 'next/navigation';

// Old links (/solve, /solve?s=...) still work: a shared cube goes to the
// puzzle its length belongs to.
export default function Page({ searchParams }: { searchParams: { s?: string } }) {
  const s = searchParams.s;
  if (!s) redirect('/solve/3x3');
  redirect(`/solve/${s.length === 24 ? '2x2' : '3x3'}?s=${encodeURIComponent(s)}`);
}
