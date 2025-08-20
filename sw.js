// service-worker.js
const CACHE_VERSION = 'v1.0.0'; // bump when you change core files
const CACHE_NAME = `jp-lesson-${CACHE_VERSION}`;

const CORE = [
  './',                 // start_url
  './index.html',
  './manifest.webmanifest',
  './lesson-shim.js',   // adjust if your main JS has a different name
  './styles.css',       // adjust or remove if not used
  './stories.json',     // we’ll treat this network-first below
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: pre-cache core shell so it loads offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
  self.skipWaiting();
});

// activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k.startsWith('jp-lesson-') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetch: robust strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // only handle same-origin GET
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // 1) SPA navigations → cache-first fallback network
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) =>
        cached || fetch(req)
      )
    );
    return;
  }

  // 2) stories.json → network-first with fallback to cache (so content updates)
  if (url.pathname.endsWith('/stories.json') || url.pathname === '/stories.json') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) everything else (same-origin static) → cache-first
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        // skip opaque or error responses
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached) // if fetch fails and we had nothing cached, still return undefined (normal)
    )
  );
});
