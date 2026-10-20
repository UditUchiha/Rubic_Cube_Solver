'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'theme';

function savedTheme(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export default function ThemeToggle() {
  // With no saved choice, keep following the OS if it switches while open.
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!savedTheme()) document.documentElement.classList.toggle('dark', e.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch {}
  }

  // Both icons render and CSS picks one, so server and client markup match.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-fg
        hover:bg-fg/5 border border-fg/10 transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {/* Moon, shown in light mode */}
      <svg className="dark:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      {/* Sun, shown in dark mode */}
      <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
  );
}
