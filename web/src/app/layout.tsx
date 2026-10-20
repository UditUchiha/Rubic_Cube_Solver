import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: "Kubrick — Rubik's Cube Solver",
  description: "Solve any Rubik's Cube in seconds with IDA* AI",
  icons: { apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#05070f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <body className="antialiased bg-gray-950 text-gray-100 min-h-screen">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
