/*
 * Offline support. Fast mode runs entirely in the browser, so once the pages
 * and their chunks are cached the solver works with no network at all.
 *
 *  - /_next/static/* is content-hashed, so cache-first is always correct.
 *  - Pages are network-first, falling back to the cached copy offline.
 *  - The solver API is never cached: it is cross-origin in production, and a
 *    same-origin /api is skipped explicitly.
 *
 * shortcut: one fixed cache name, so chunks from old deploys accumulate until
 * the user clears site data. Bump CACHE when that starts to matter, or switch
 * to a build-time precache manifest.
 */
const CACHE = 'kubrick-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The first visit loads its chunks before this worker exists, so the page
// sends the URLs it already fetched and they are cached here.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(event.data.urls.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          return response;
        })
        // ignoreSearch so a shared /solve?s=... link still opens offline.
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
