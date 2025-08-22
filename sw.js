// service-worker.js
const VERSION = 'v1.0.1';                      // bump when core changes
const CACHE_NAME = `jp-lesson-${VERSION}`;

const CORE = [
  './',
  './index.html',
  './lesson.html',
  './reference.html',
  './stories.json',
  './lesson-loader.js',
  './lesson-shim.js',
  './images/favicon.ico'
];

// Install: pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('jp-lesson-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ignore cross-origin

  // 1) Real page navigations: try requested page from cache, else network, else offline fallback to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req)
        .then((cached) => cached || fetch(req))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2) stories.json: network-first (so content updates), fallback to cache
  if (url.pathname.endsWith('/stories.json') || url.pathname === '/stories.json' || url.pathname.endsWith('stories.json')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 3) Other same-origin static: cache-first, then network; cache good responses
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
