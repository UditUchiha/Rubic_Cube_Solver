import Link from 'next/link';
import RubiksCube3D from '@/components/RubiksCube3D';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-gradient-to-b from-gray-950 to-gray-900">
      <div className="flex flex-col items-center gap-8 text-center max-w-2xl">
        <div className="pointer-events-none">
          <RubiksCube3D size={180} autoRotate />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Rubik&apos;s Cube Solver
          </h1>
          <p className="text-lg text-gray-400">
            Input your scrambled cube and our IDA* AI finds the optimal solution in seconds.
          </p>
        </div>

        <Link
          href="/solve"
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-lg font-semibold transition-colors shadow-lg shadow-indigo-900/50"
        >
          Solve Now →
        </Link>

        <div className="flex gap-8 text-sm text-gray-500 mt-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-white">IDA*</span>
            <span>Algorithm</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-white">48 MB</span>
            <span>Pattern DB</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-white">~20</span>
            <span>Moves max</span>
          </div>
        </div>
      </div>
    </main>
  );
}
