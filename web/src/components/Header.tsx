import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 rule-b px-4 py-3 sm:px-6 flex items-center gap-3" style={{ background: 'var(--bg)' }}>
      <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <span aria-hidden className="colorbar h-3 w-9 rounded-[2px]" style={{ boxShadow: 'inset 0 0 0 1px var(--rule-strong)' }} />
        <span className="mono font-bold text-base sm:text-lg text-fg">Kubrick</span>
      </Link>
      <span className="mono text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>cube solver</span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
