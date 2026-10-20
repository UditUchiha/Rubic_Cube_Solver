import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 glass border-x-0 border-t-0 px-4 py-3 sm:px-6 flex items-center gap-3">
      <Link
        href="/"
        className="text-lg sm:text-xl font-bold tracking-tight text-fg hover:opacity-80 transition-opacity"
      >
        Kubrick
      </Link>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
