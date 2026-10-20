/*
 * Ask the service worker (public/sw.js) to cache scripts that were fetched
 * before it took control: on a first visit the page and the solver worker
 * load everything before the service worker exists, so without this the app
 * would only work offline from the second visit on.
 */
export function cacheForOffline(urls: string[]): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const own = urls.filter((url) => new URL(url, location.href).origin === location.origin);
  if (own.length === 0) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: 'cache-urls', urls: own }))
    .catch(() => {});
}
