'use client';

import { useEffect } from 'react';
import { cacheForOffline } from '@/lib/offline';

// Production only: in dev the worker would serve stale chunks over hot reload.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // This page and its chunks loaded before the worker existed.
    cacheForOffline([
      location.pathname,
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
      ...performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(`${location.origin}/_next/static/`)),
    ]);
  }, []);

  return null;
}
