// sw.js — Network-first service worker for ResonanceHRV app shell
// Serves fresh content when the server is reachable; falls back to cache when offline.

const CACHE_NAME = 'resonancehrv-v16';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/main.js',
  '/js/state.js',
  '/js/storage.js',
  '/js/ble.js',
  '/js/dsp.js',
  '/js/renderer.js',
  '/js/audio.js',
  '/js/discovery.js',
  '/js/practice.js',
  '/js/dashboard.js',
  '/js/oura.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests; let cross-origin (CDN) go straight to network
  if (url.origin !== self.location.origin) return;

  // Network-first: try server, fall back to cache, ensures fresh code on every load
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache a copy of the fresh response for offline fallback
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
