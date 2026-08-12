const CACHE_NAME = 'dharani-cache-v1.13';
const APP_SHELL = [
  './index.html',
  './privacy.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

// install: pre-cache the app shell so the app can launch offline
// (each file cached individually so one failure doesn't block the whole install)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('SW precache failed for', url, err);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

// activate: drop old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// fetch: stale-while-revalidate for same-origin GET requests,
// falling back to cache when offline (e.g. Google Fonts, CDN assets)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // network failed: serve cache if we have it, otherwise a real
          // offline Response — never resolve to undefined (causes ERR_FAILED)
          if (cached) return cached;
          return new Response(
            '오프라인 상태이며 캐시된 사본이 없습니다.',
            { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        });
      return cached || network;
    })
  );
});
