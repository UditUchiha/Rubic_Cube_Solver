import Link from 'next/link';
import RubiksCube3D from '@/components/RubiksCube3D';
import Header from '@/components/Header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description:
    "Paint, scan or photograph your scrambled Rubik's Cube and get a solution in milliseconds, right in your browser, or the provably shortest one from a C++ IDA* solver.",
};

const STATS = [
  { value: '<0.2s', label: 'Fast mode',     sub: 'Two-phase, in your browser' },
  { value: 'IDA*',  label: 'Optimal mode',  sub: 'Provably fewest moves'      },
  { value: '20',    label: "God's Number",  sub: 'Most moves any cube needs'  },
];

// Icon paths from Lucide (lucide.dev, ISC licence).
const FEATURES = [
  {
    icon: (
      <>
        <circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" />
        <circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z" />
      </>
    ),
    title: 'Paint it',
    desc:  'Click each sticker to paint your cube exactly as it looks.',
  },
  {
    icon: (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    title: 'Scan it',
    desc:  'Hold each face up to your webcam and let us detect the colours.',
  },
  {
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
      </>
    ),
    title: 'Upload it',
    desc:  'Upload photos of all six faces and we will do the rest.',
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </>
    ),
    title: 'Watch it solve',
    desc:  'Step through the solution move by move on an animated 3D cube.',
  },
];

export default function Home() {
  return (
    <>
    <Header />
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
          backgroundImage: 'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-8 sm:pt-24 sm:pb-12 text-center">

        {/* Badge */}
        <div className="animate-fade-in-up mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--accent-text)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
            Fast &amp; optimal solvers
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
          <span className="text-fg">in Seconds</span>
        </h1>

        {/* Subtitle */}
        <p className="animate-fade-in-up-d3 max-w-xl text-base sm:text-lg text-slate-400 mb-8 text-balance">
          Paint, scan or photograph your cube and get a solution in{' '}
          <span className="text-fg font-medium">milliseconds</span>, right in your browser.
          Want the fewest possible moves? Optimal mode searches for them with C++ IDA*.
        </p>

        {/* CTA */}
        <div className="animate-fade-in-up-d4">
          <Link
            href="/solve"
            id="solve-cta-btn"
            className="btn-shimmer inline-flex items-center gap-2 text-white px-8 py-3.5 rounded-2xl text-base sm:text-lg font-semibold transition-all duration-300
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
              <span className="text-xs sm:text-sm font-semibold text-fg">{label}</span>
              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature cards ────────────────────────────────────────────────── */}
      <section className="relative px-4 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">
            Three ways in, one way out
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="glass rounded-2xl p-4 sm:p-5 flex flex-col gap-2 group transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/40"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {icon}
                  </svg>
                </span>
                <span className="text-sm font-semibold text-fg">{title}</span>
                <span className="text-xs text-slate-400 leading-relaxed">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative border-t px-4 py-5 text-center text-xs text-slate-600" style={{ borderColor: 'var(--border)' }}>
        Built with C++ IDA* · Kociemba two-phase · Three.js · Next.js
      </footer>
    </main>
    </>
  );
}
