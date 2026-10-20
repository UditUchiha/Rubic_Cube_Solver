import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kubrick — Rubik's Cube Solver",
    short_name: 'Kubrick',
    description: "Solve any Rubik's Cube in seconds, even offline",
    // Straight to the solver: Fast mode runs in the browser, so it works offline.
    start_url: '/solve',
    display: 'standalone',
    background_color: '#05070f',
    theme_color: '#05070f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
