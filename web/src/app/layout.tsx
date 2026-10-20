import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description: "Solve any Rubik's Cube in milliseconds, right in your browser.",
};

// Runs before first paint so a dark-mode visitor never sees a light flash.
// A saved choice wins; otherwise follow the OS. Kept in sync with ThemeToggle.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script edits <html>'s class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
