import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description: "Solve any Rubik's Cube in milliseconds, right in your browser.",
  icons: { apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#05070f',
};

// Mono for readouts, keys and headings; its sans sibling for running copy.
const mono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });
const sans = Space_Grotesk({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-sans' });

// Runs before first paint so a dark-mode visitor never sees a light flash.
// A saved choice wins; otherwise follow the OS. Kept in sync with ThemeToggle.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script edits <html>'s class before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${mono.variable} ${sans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased min-h-screen">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
