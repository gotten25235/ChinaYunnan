/*
  雲南慢時光 Service Worker
  - APP_CACHE: HTML / CSS / JS / JSON 與必要 runtime，版本更新可替換。
  - IMAGE_CACHE: 圖片長效 Cache First；不隨 APP_CACHE 更新而清空。
  - OpenStreetMap tile 不進圖片快取，避免地圖瓦片大量佔用儲存空間。
*/
const APP_CACHE = 'yunnan-app-v1-20260909-offline-cache1';
const IMAGE_CACHE = 'yunnan-images-v1';
const APP_CACHE_PREFIX = 'yunnan-app-';

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css?v=20260909-offline-cache1',
  './js/app.js?v=20260909-offline-cache1',
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
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      // 只清除舊程式快取；圖片快取刻意跨版本保留。
      if (name.startsWith(APP_CACHE_PREFIX) && name !== APP_CACHE) return caches.delete(name);
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

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (canStore(response)) {
      eventlessPut(cache, request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

function eventlessPut(cache, request, response) {
  // Cache 寫入不應阻塞圖片顯示；失敗（配額/CORS）時仍可正常顯示網路圖片。
  cache.put(request, response).catch(() => {});
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreVary: false });

  const networkPromise = fetch(request).then(response => {
    if (canStore(response)) eventlessPut(cache, request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    // 不等待網路：先顯示本機版本，背景更新下次使用。
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

  if (appLike) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
