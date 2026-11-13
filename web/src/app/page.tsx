import Link from 'next/link';
import HeroPanel from '@/components/HeroPanel';
import Header from '@/components/Header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description:
    "Paint, scan or photograph your scrambled Rubik's Cube and get a solution in milliseconds, right in your browser, or the provably shortest one from a C++ IDA* solver.",
};

// The solver's figures. Every value here is measured or exact; see the README.
const SPEC: [string, string][] = [
  ['reachable states', '43,252,003,274,489,856,000'],
  ['longest optimal solution', '20 moves'],
  ['fast solver', 'Kociemba two-phase in a Web Worker, about 90 ms, about 21 moves'],
  ['optimal solver', "Korf's IDA* in C++, three pattern databases, 173 million entries"],
  ['input', 'paint, webcam or photos; a face scanned the wrong way round is turned back'],
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8 sm:gap-12">
        <HeroPanel>
          <h1 className="mono font-bold text-3xl sm:text-4xl leading-tight text-fg text-balance">
            Any cube. Fewest moves.
          </h1>
          <p className="text-base leading-relaxed max-w-prose">
            Paint or scan a scrambled cube and watch the solution play back in 3D. Fast mode solves
            in your browser in about a tenth of a second. Optimal mode runs Korf&apos;s IDA* in C++
            and returns the shortest solution there is.
          </p>
          <Link href="/solve" id="solve-cta-btn" className="key key-primary self-start px-6 py-3 text-sm sm:text-base">
            Solve a cube
          </Link>
        </HeroPanel>

        <section aria-label="Solver specification" className="bezel">
          <dl className="mono text-sm">
            {SPEC.map(([k, v], i) => (
              <div key={k} className={`grid grid-cols-1 sm:grid-cols-[22ch_1fr] gap-1 sm:gap-6 px-4 py-3 sm:px-5 ${i < SPEC.length - 1 ? 'rule-b' : ''}`}>
                <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                <dd className="text-fg break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="rule-t pt-5 mono text-xs flex flex-wrap gap-x-6 gap-y-2" style={{ color: 'var(--muted)' }}>
          <span>C++ IDA*, Kociemba two-phase, Three.js, Next.js</span>
          <a href="https://github.com/UditUchiha/Rubic_Cube_Solver" className="underline underline-offset-4 hover:text-fg">
            Source on GitHub
          </a>
        </footer>
      </main>
    </>
  );
}
