const CACHE_NAME = 'dharani-cache-v1.14';
const APP_SHELL = [
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

// fetch: stale-while-revalidate for same-origin GET requests,
// falling back to cache when offline (e.g. Google Fonts, CDN assets)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // same-origin('basic') 응답만 캐싱 — 외부 opaque 응답을 잘못 캐싱하는 것 방지
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          // 네트워크 실패: 캐시가 있으면 그걸 반환
          if (cached) return cached;

          // 페이지 이동(navigate) 요청이면 캐시된 index.html로 폴백 (SPA 오프라인 진입점)
          if (req.mode === 'navigate') {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
          }

          // 그 외(이미지/폰트/JSON 등)는 캐시도 폴백도 없으면
          // undefined를 반환하지 않고 항상 유효한 Response를 반환해
          // net::ERR_FAILED로 죽지 않도록 함
          return new Response(
            '오프라인 상태이며 캐시된 사본이 없습니다.',
            { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        });
      return cached || network;
    })
  );
});