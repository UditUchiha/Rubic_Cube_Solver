import Link from 'next/link';
import RubiksCube3D from '@/components/RubiksCube3D';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Rubik's Cube Solver — IDA* AI",
  description:
    "Input your scrambled Rubik's Cube and our IDA* solver finds the shortest possible solution in seconds, using 86 MB of corner and edge pattern databases.",
};

const STATS = [
  { value: 'IDA*',  label: 'Algorithm',   sub: 'Optimal path search'     },
  { value: '86 MB', label: 'Pattern DB',  sub: 'Corner + 2 edge groups'  },
  { value: '≤20',   label: 'Move limit',  sub: "God's Number bound"      },
];

const FEATURES = [
  {
    icon: '🎨',
    title: 'Manual Input',
    desc:  'Click each sticker to paint your cube exactly as it looks.',
  },
  {
    icon: '📷',
    title: 'Camera Scan',
    desc:  'Hold each face up to your webcam and let us detect the colors.',
  },
  {
    icon: '🖼️',
    title: 'Image Upload',
    desc:  'Upload photos of all six faces and we will do the rest.',
  },
  {
    icon: '▶️',
    title: 'Animated Player',
    desc:  'Step through the solution move-by-move with a 3-D animated cube.',
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Aurora background ────────────────────────────────────────────── */}
      <div className="aurora" aria-hidden>
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* ── Subtle grid overlay ──────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-8 sm:pt-24 sm:pb-12 text-center">

        {/* Badge */}
        <div className="animate-fade-in-up mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
            Powered by IDA* Algorithm
          </span>
        </div>

        {/* 3D Cube - drag to turn it, it keeps spinning either way.
            This used to carry `pointer-events-none`, which silently disabled
            OrbitControls while the cube still advertised a grab cursor. */}
        <div className="animate-fade-in-up-d1 animate-float mb-6 sm:mb-8 h-[220px] w-[220px] sm:h-[280px] sm:w-[280px]">
          <RubiksCube3D fill autoRotate interactive />
        </div>

        {/* Heading */}
        <h1 className="animate-fade-in-up-d2 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-4 text-balance">
          <span className="gradient-text">Solve Any Rubik&apos;s Cube</span>
          <br />
          <span className="text-white">in Seconds</span>
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-in-up-d3 max-w-xl text-base sm:text-lg text-slate-400 mb-8 text-balance">
          Paint your scrambled cube, hit Solve — we find the{' '}
          <span className="text-white font-medium">shortest possible solution</span> using
          86 MB of pattern databases and iterative-deepening A*.
        </p>

        {/* CTA */}
        <div className="animate-fade-in-up-d4">
          <Link
            href="/solve"
            id="solve-cta-btn"
            className="btn-shimmer inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base sm:text-lg font-semibold transition-all duration-300
              hover:scale-105 hover:-translate-y-0.5 active:scale-95
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 0 24px rgba(99,102,241,0.55), 0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            Solve Now
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-10 sm:pb-16">
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-3 sm:gap-6">
          {STATS.map(({ value, label, sub }) => (
            <div
              key={label}
              className="glass rounded-2xl p-3 sm:p-5 flex flex-col items-center text-center gap-0.5 transition-transform duration-300 hover:-translate-y-1"
            >
              <span className="text-xl sm:text-3xl font-extrabold gradient-text-indigo">{value}</span>
              <span className="text-xs sm:text-sm font-semibold text-white">{label}</span>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature cards ────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">
            Three ways to input your cube
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="glass rounded-2xl p-4 sm:p-5 flex flex-col gap-2 group transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/40"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-sm font-semibold text-white">{title}</span>
                <span className="text-xs text-slate-400 leading-relaxed">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative border-t px-4 py-5 text-center text-xs text-slate-600" style={{ borderColor: 'var(--border)' }}>
        Built with C++ · IDA* · Next.js
      </footer>
    </main>
  );
}
