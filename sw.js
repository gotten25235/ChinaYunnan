/*
  雲南慢時光 Service Worker
  - VERSION 是固定 V1 識別；CACHE_REVISION 只負責讓新版 HTML/CSS/JS 建立新 App Shell。
  - 核心 App Shell 在 install 預先快取；「離線準備」可選擇是否另外下載旅行照片。
  - 本地與遠端旅行照片統一放進 Image Cache，方便獨立下載／清除；OSM / 高德 tile 不長效快取。
  - 天氣由 weather.js 使用 localStorage 保存最後成功資料；Service Worker 不偽造即時天氣。
  - CHECK_OFFLINE 回傳核心、本地照片、遠端照片的實際缺失清單；未選取照片時不影響完成判定。
*/
const VERSION = 'v1';
const CACHE_REVISION = '20260910-gesture-ownership-01';
const APP_CACHE = `yunnan-app-${VERSION}-${CACHE_REVISION}`;
const IMAGE_CACHE = `yunnan-images-${VERSION}`;
const OFFLINE_META_CACHE = `yunnan-offline-${VERSION}`;
const PROJECT_CACHE_PREFIX = 'yunnan-';

const CORE_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline-manifest.json',
  `./css/style.css?v=${VERSION}`,
  `./js/network.js?v=${VERSION}`,
  `./js/core.js?v=${VERSION}`,
  `./js/weather.js?v=${VERSION}`,
  `./js/offline.js?v=${VERSION}`,
  `./js/settings.js?v=${VERSION}`,
  `./js/reader.js?v=${VERSION}`,
  `./js/journey.js?v=${VERSION}`,
  `./js/map.js?v=${VERSION}`,
  `./js/library.js?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  './data/trip-data.json',
  './data/social-sources.json',
  './data/source-index.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    for (const asset of CORE_SHELL) {
      const request = new Request(asset, {cache:'reload'});
      const response = await fetch(request);
      if (!canStore(response)) throw new Error(`Core asset unavailable: ${asset}`);
      await cache.put(asset, response.clone());
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, IMAGE_CACHE, OFFLINE_META_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if (name.startsWith(PROJECT_CACHE_PREFIX) && !keep.has(name)) return caches.delete(name);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

function canStore(response) { return !!response && (response.ok || response.type === 'opaque'); }
function isMapTile(url) {
  return url.hostname === 'tile.openstreetmap.org' ||
    url.hostname.endsWith('.tile.openstreetmap.org') ||
    url.hostname.endsWith('.is.autonavi.com') ||
    url.hostname === 'wprd01.is.autonavi.com' || url.hostname === 'wprd02.is.autonavi.com' ||
    url.hostname === 'wprd03.is.autonavi.com' || url.hostname === 'wprd04.is.autonavi.com';
}
function isPhotoRequest(request, url) {
  if (isMapTile(url)) return false;
  if (request.destination === 'image') return true;
  return /\.(?:avif|webp|png|jpe?g|gif|svg)(?:$|\?)/i.test(url.pathname + url.search);
}
function eventlessPut(cache, request, response) { cache.put(request, response).catch(() => {}); }

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (canStore(response)) eventlessPut(cache, request, response.clone());
    return response;
  } catch (error) {
    return new Response('', {status:503,statusText:'Image unavailable offline'});
  }
}

async function appStaleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (canStore(response)) eventlessPut(cache, request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) { networkPromise.catch(() => {}); return cached; }
  const network = await networkPromise;
  if (network) return network;
  if (request.mode === 'navigate') {
    const fallback = await cache.match('./index.html') || await cache.match('./');
    if (fallback) return fallback;
  }
  return new Response('Offline', {status:503,statusText:'Offline'});
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isMapTile(url)) return;
  if (isPhotoRequest(request, url)) { event.respondWith(cacheFirstImage(request)); return; }

  const sameOrigin = url.origin === self.location.origin;
  const appLike = request.mode === 'navigate' || request.destination === 'document' || request.destination === 'script' || request.destination === 'style' ||
    (sameOrigin && (/\/data\/[^/]+\.json$/i.test(url.pathname) || /\.(?:webmanifest|json)$/i.test(url.pathname)));
  if (appLike) event.respondWith(appStaleWhileRevalidate(request));
});

async function readOfflineManifest() {
  const cache = await caches.open(APP_CACHE);
  let response = await cache.match('./offline-manifest.json');
  if (!response) response = await fetch('./offline-manifest.json', {cache:'no-store'});
  if (!response || !response.ok) throw new Error('offline-manifest.json unavailable');
  return response.json();
}
function remotePhotoRecords(manifest) {
  const values = Array.isArray(manifest.remotePhotos) ? manifest.remotePhotos : [];
  return values.map((value,index)=>typeof value==='string'
    ? {id:`remote-${index+1}`,ids:[],url:value,label:value,source:''}
    : {id:String(value?.id||`remote-${index+1}`),ids:Array.isArray(value?.ids)?value.ids:[],url:String(value?.url||''),label:String(value?.label||value?.id||value?.url||`遠端照片 ${index+1}`),source:String(value?.source||'')}
  ).filter(record=>/^https?:\/\//i.test(record.url));
}
async function cacheCoreAsset(asset) {
  const cache = await caches.open(APP_CACHE);
  if (await cache.match(asset)) return true;
  const response = await fetch(asset, {cache:'reload'});
  if (!canStore(response)) return false;
  await cache.put(asset, response.clone());
  return true;
}
async function cacheLocalPhoto(asset) {
  const cache = await caches.open(IMAGE_CACHE);
  if (await cache.match(asset)) return true;
  const response = await fetch(asset, {cache:'reload'});
  if (!canStore(response)) return false;
  await cache.put(asset, response.clone());
  return true;
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchRemotePhoto(url,referrerPolicy='strict-origin-when-cross-origin') {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 22000);
  try {
    const request = new Request(url, {mode:'no-cors',credentials:'omit',cache:'reload',referrerPolicy,signal:controller.signal});
    return await fetch(request);
  } finally { clearTimeout(timer); }
}
async function cacheRemotePhoto(record,{attempts=3}={}) {
  const cache = await caches.open(IMAGE_CACHE);
  if (await cache.match(record.url)) return true;
  let lastError=null;
  for(let attempt=0;attempt<attempts;attempt++){
    const policy=attempt===1?'no-referrer':'strict-origin-when-cross-origin';
    try{
      const response=await fetchRemotePhoto(record.url,policy);
      if(canStore(response)){
        await cache.put(record.url,response.clone());
        return true;
      }
      lastError=new Error(`HTTP ${response.status||'opaque failure'}`);
    }catch(error){lastError=error;}
    if(attempt<attempts-1)await wait(600*(attempt+1));
  }
  console.warn('Offline remote photo failed',record.label,record.url,lastError);
  return false;
}
async function cacheOptionalRuntime(url) {
  const cache = await caches.open(APP_CACHE);
  if (await cache.match(url)) return true;
  try {
    const request = new Request(url, {mode:'no-cors', credentials:'omit', referrerPolicy:'no-referrer'});
    const response = await fetch(request);
    if (!canStore(response)) return false;
    await cache.put(url, response.clone());
    return true;
  } catch { return false; }
}
async function hasIn(cacheName,key) { const cache=await caches.open(cacheName); return Boolean(await cache.match(key)); }

async function checkOffline(manifest) {
  const coreAssets = Array.isArray(manifest.coreAssets) ? manifest.coreAssets : [];
  const photoAssets = Array.isArray(manifest.photoAssets) ? manifest.photoAssets : [];
  const remotePhotos = remotePhotoRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const coreMissingItems=[],photoLocalMissingItems=[],remoteMissingItems=[];
  let optionalCached=0;
  for (const asset of coreAssets) if (!(await hasIn(APP_CACHE,asset))) coreMissingItems.push({asset,label:asset});
  for (const asset of photoAssets) if (!(await hasIn(IMAGE_CACHE,asset))) photoLocalMissingItems.push({asset,label:asset});
  for (const record of remotePhotos) if (!(await hasIn(IMAGE_CACHE,record.url))) remoteMissingItems.push(record);
  for (const url of optionalRuntime) if (await hasIn(APP_CACHE,url)) optionalCached++;
  return {
    coreTotal:coreAssets.length,coreMissing:coreMissingItems.length,coreMissingItems,
    photoLocalTotal:photoAssets.length,photoLocalMissing:photoLocalMissingItems.length,photoLocalMissingItems,
    remoteTotal:remotePhotos.length,remoteMissing:remoteMissingItems.length,remoteMissingItems,
    photoTotal:photoAssets.length+remotePhotos.length,
    photoMissing:photoLocalMissingItems.length+remoteMissingItems.length,
    optionalTotal:optionalRuntime.length,optionalCached
  };
}

async function clearOfflinePhotos(manifest) {
  await caches.delete(IMAGE_CACHE);
  await caches.delete(OFFLINE_META_CACHE);
  return checkOffline(manifest);
}
async function clearOfflineDownloads(manifest) {
  await caches.delete(IMAGE_CACHE);
  await caches.delete(OFFLINE_META_CACHE);
  const app=await caches.open(APP_CACHE);
  const keep=new Set(CORE_SHELL.map(asset=>new URL(asset,self.registration.scope).href));
  const keys=await app.keys();
  await Promise.all(keys.map(request=>keep.has(request.url)?Promise.resolve(false):app.delete(request)));
  return checkOffline(manifest);
}
async function storeOfflineResult(result){
  const meta=await caches.open(OFFLINE_META_CACHE);
  await meta.put('./offline-prep-result.json',new Response(JSON.stringify({...result,checkedAt:Date.now()}),{headers:{'Content-Type':'application/json'}}));
}

async function prepareOffline(port,{includePhotos=true}={}) {
  const manifest = await readOfflineManifest();
  const coreAssets = Array.isArray(manifest.coreAssets) ? manifest.coreAssets : [];
  const photoAssets = Array.isArray(manifest.photoAssets) ? manifest.photoAssets : [];
  const remotePhotos = remotePhotoRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const total = coreAssets.length + (includePhotos ? photoAssets.length + remotePhotos.length : 0);
  let done=0;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total,label});
  progress('正在準備網頁核心與其他資料…');
  for (const asset of coreAssets) {
    try { await cacheCoreAsset(asset); } catch (error) { console.warn('Offline core asset failed',asset,error); }
    done++; progress('正在準備網頁核心與其他資料…');
  }
  if(includePhotos){
    for (const asset of photoAssets) {
      progress(`正在下載旅行照片… ${asset.split('/').pop()||asset}`);
      try { await cacheLocalPhoto(asset); } catch (error) { console.warn('Offline local photo failed',asset,error); }
      done++; progress(`正在下載旅行照片… ${asset.split('/').pop()||asset}`);
    }
    for (const record of remotePhotos) {
      progress(`正在下載旅行照片… ${record.label}`);
      await cacheRemotePhoto(record,{attempts:3});
      done++; progress(`正在下載旅行照片… ${record.label}`);
    }
  }
  for (const url of optionalRuntime) await cacheOptionalRuntime(url);
  const result = await checkOffline(manifest);
  await storeOfflineResult(result);
  return result;
}
async function retryMissingPhotos(port){
  const manifest=await readOfflineManifest();
  const before=await checkOffline(manifest);
  const localRecords=before.photoLocalMissingItems||[];
  const remoteRecords=before.remoteMissingItems||[];
  let done=0,total=localRecords.length+remoteRecords.length;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total,label});
  if(!total)return before;
  for(const item of localRecords){
    progress(`重試照片：${item.asset}`);
    try{await cacheLocalPhoto(item.asset);}catch(error){console.warn('Retry local photo failed',item.asset,error);}
    done++;progress(`重試照片：${item.asset}`);
  }
  for(const record of remoteRecords){
    progress(`重試照片：${record.label}`);
    await cacheRemotePhoto(record,{attempts:4});
    done++;progress(`重試照片：${record.label}`);
  }
  const result=await checkOffline(manifest);await storeOfflineResult(result);return result;
}

self.addEventListener('message', event => {
  const msg=event.data||{},port=event.ports?.[0];
  const allowed=['PREPARE_OFFLINE','RETRY_OFFLINE_PHOTOS','CHECK_OFFLINE','CLEAR_OFFLINE_PHOTOS','CLEAR_OFFLINE_DOWNLOADS'];
  if (!port || !allowed.includes(msg.type)) return;
  event.waitUntil((async()=>{
    try {
      const manifest=await readOfflineManifest();
      let result;
      if(msg.type==='PREPARE_OFFLINE')result=await prepareOffline(port,{includePhotos:msg.includePhotos!==false});
      else if(msg.type==='RETRY_OFFLINE_PHOTOS')result=await retryMissingPhotos(port);
      else if(msg.type==='CLEAR_OFFLINE_PHOTOS')result=await clearOfflinePhotos(manifest);
      else if(msg.type==='CLEAR_OFFLINE_DOWNLOADS')result=await clearOfflineDownloads(manifest);
      else result=await checkOffline(manifest);
      port.postMessage({type:'OFFLINE_RESULT',result});
    } catch (error) {
      port.postMessage({type:'OFFLINE_ERROR',error:String(error?.message||error)});
    }
  })());
});
