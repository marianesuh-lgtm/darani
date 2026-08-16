const CACHE_NAME = 'dharani-cache-v1.15';
const APP_SHELL = [
  './',
  './index.html',
  './privacyDarani.html',
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

// fetch: cache-first with background revalidation (stale-while-revalidate),
// falling back to cache when offline, and to index.html for offline navigations
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      // 1. 캐시에 있으면 즉시 반환하고, 백그라운드에서 최신 버전으로 갱신
      const cached = await caches.match(req);
      if (cached) {
        fetch(req).then(async (res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, res.clone());
          }
        }).catch(() => {}); // 백그라운드 갱신 실패는 무시(다음 온라인 시 재시도됨)
        return cached;
      }

      // 2. 캐시에 없으면 네트워크 요청
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, res.clone());
      }
      return res;

    } catch (err) {
      // 3. 네트워크도 실패(오프라인)하고 캐시도 없는 경우의 폴백
      // 페이지 이동(navigate) 요청이면 앱 진입점인 index.html로 보냄
      // (다른 페이지를 대신 보여주면 안 됨 — 항상 index.html 고정)
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }

      return new Response(
        '오프라인 상태이며 캐시된 사본이 없습니다.',
        { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }
  })());
});