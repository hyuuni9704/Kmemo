// Kmemo 오프라인 지원용 Service Worker
// 주의: 이 파일은 반드시 프로젝트 루트(js/ 폴더 아님)에 있어야 함.
// Service Worker의 기본 제어 범위(scope)는 자신이 위치한 폴더 이하로 한정되므로,
// js/sw.js에 두면 /js/ 아래만 제어되어 index.html 등을 캐싱할 수 없음.

const CACHE_NAME = 'kmemo-cache-v2';

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

// 새 버전은 설치만 해두고 바로 활성화하지 않음(자동 skipWaiting 호출 안 함).
// 사용자가 업데이트를 수락(하루 1번 자동 확인 또는 마이페이지 수동 버튼)하면
// 클라이언트가 보내는 SKIP_WAITING 메시지를 받은 뒤에만 활성화됨.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
