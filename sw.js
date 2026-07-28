// Kmemo 오프라인 지원용 Service Worker
// 주의: 이 파일은 반드시 프로젝트 루트(js/ 폴더 아님)에 있어야 함.
// Service Worker의 기본 제어 범위(scope)는 자신이 위치한 폴더 이하로 한정되므로,
// js/sw.js에 두면 /js/ 아래만 제어되어 index.html 등을 캐싱할 수 없음.

const CACHE_NAME = 'kmemo-cache-v1';

const PRECACHE_URLS = [
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/sync.js',
  'js/supabase-config.js',
  'manifest.json',
  'img/icon-192x192.png',
  'img/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// 온라인일 때는 항상 최신 파일을 받아오고, 오프라인일 때만 캐시된 파일로 대체 (네트워크 우선)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Supabase/CDN 등 외부 요청은 그대로 통과

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
