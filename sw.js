/*
  雲南慢時光 Service Worker
  - VERSION 只作固定 V1 識別。
  - APP_CACHE: HTML / CSS / JS / JSON，install 時以現行 APP_SHELL 覆寫同名項目，fetch 採 stale-while-revalidate。
  - IMAGE_CACHE: 圖片 Cache First；固定保留 V1 圖片快取，換圖以 URL / filename identity 更新。
  - OpenStreetMap tile 不進圖片快取，避免地圖瓦片大量佔用儲存空間。
  - VERSION 由 tools/release.py 依 tools/release.json 同步。
*/
const VERSION = 'v1';
const APP_CACHE = `yunnan-app-${VERSION}`;
const IMAGE_CACHE = `yunnan-images-${VERSION}`;
const PROJECT_CACHE_PREFIX = 'yunnan-';

const APP_SHELL = [
  './',
  './index.html',
  `./css/style.css?v=${VERSION}`,
  `./js/core.js?v=${VERSION}`,
  `./js/reader.js?v=${VERSION}`,
  `./js/journey.js?v=${VERSION}`,
  `./js/map.js?v=${VERSION}`,
  `./js/library.js?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  './data/trip-data.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, IMAGE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if (name.startsWith(PROJECT_CACHE_PREFIX) && !keep.has(name)) return caches.delete(name);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

function canStore(response) {
  return !!response && (response.ok || response.type === 'opaque');
}

function isMapTile(url) {
  return url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org');
}

function isPhotoRequest(request, url) {
  if (isMapTile(url)) return false;
  if (request.destination === 'image') return true;
  return /\.(?:avif|webp|png|jpe?g|gif|svg)(?:$|\?)/i.test(url.pathname + url.search);
}

function eventlessPut(cache, request, response) {
  cache.put(request, response).catch(() => {});
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canStore(response)) eventlessPut(cache, request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreVary: false });
  const networkPromise = fetch(request).then(response => {
    if (canStore(response)) eventlessPut(cache, request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  if (request.mode === 'navigate') {
    const fallback = await cache.match('./index.html') || await cache.match('./');
    if (fallback) return fallback;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isPhotoRequest(request, url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const appLike = request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    (sameOrigin && /\/data\/[^/]+\.json$/i.test(url.pathname));

  if (appLike) event.respondWith(staleWhileRevalidate(request));
});
