// sw.js — Cache-first service worker for ResonanceHRV app shell
// Caches static assets on install; serves from cache first, falls back to network.

const CACHE_NAME = 'resonancehrv-v11';
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
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
