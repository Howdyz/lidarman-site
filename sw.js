// Service worker for Lidarman.
//
// This file was previously a deliberate no-op — register, claim, and an empty
// fetch handler — while manifest.json and an "Install App" button shipped
// alongside it. Installing therefore produced an app icon with no offline
// capability at all, which is a promise the site was not keeping.
//
// Strategy, chosen around one hard constraint: this is hosted on GitHub Pages,
// which sends Cache-Control: max-age=600 on HTML. A plain fetch() can be
// satisfied from the browser's own HTTP cache for ten minutes after a real
// deploy, so "network-first" that does not bypass it is not network-first at
// all — it silently serves stale markup right after a push. Every network read
// here therefore passes cache: 'no-store'.
//
//   documents  network first, fall back to cache   — always current when online
//   assets     cache first, revalidate in background — icons and imagery
//   anything else (the API on its own origin, /static/jobs/* renders)
//              passes straight through, never cached
//
// A scan result is not cacheable in any useful sense — it is minutes of
// server-side compute against a job id that is cleaned up within the hour —
// so nothing on the backend origin is touched here.

const VERSION = 'lidarman-v2';
const DOC_CACHE = VERSION + '-doc';
const ASSET_CACHE = VERSION + '-asset';

// Only the entry point and the icons are precached. The guides are cached as
// they are read: precaching every article would download the site to a phone
// that may only ever open the map.
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DOC_CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) =>
        // Individually, and tolerant of failure: one 404 in this list must not
        // abort the whole install and leave the worker permanently uninstalled.
        fetch(new Request(url, { cache: 'no-store' }))
          .then((res) => (res.ok ? cache.put(url, res) : null))
          .catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== DOC_CACHE && k !== ASSET_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Same-origin only. The API and its rendered job imagery live on another
  // origin and are none of this worker's business.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname === '/') {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' }))
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(DOC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        // Served from cache immediately; refreshed in the background so a
        // changed image is picked up on the next visit rather than never.
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || network;
      })
    );
  }
});
