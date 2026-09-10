/*
  雲南慢時光 Service Worker
  - VERSION 是固定 V1 識別，不是遞增版本號。
  - 核心 App Shell 在 install 預先快取；使用者可在「離線準備」明確下載全部本地資源與遠端精準照片。
  - 圖片 Cache First；OSM / 高德地圖瓦片不長效快取，離線時由網站自己的簡圖 fallback 顯示地標。
  - 天氣使用 weather.js 的 localStorage 最後成功資料；Service Worker 不偽造即時資料。
  - 離線檢查會回傳實際缺失項目；遠端照片可只重試失敗項目，不再只顯示 115/116。
*/
const VERSION = 'v1';
const APP_CACHE = `yunnan-app-${VERSION}`;
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
    await cache.addAll(CORE_SHELL);
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
  const response = await fetch(request);
  if (canStore(response)) eventlessPut(cache, request, response.clone());
  return response;
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
async function cacheLocalAsset(asset) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(asset);
  if (cached) return true;
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
  const localAssets = Array.isArray(manifest.localAssets) ? manifest.localAssets : [];
  const remotePhotos = remotePhotoRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const localMissingItems=[],remoteMissingItems=[];
  let optionalCached=0;
  for (const asset of localAssets) if (!(await hasIn(APP_CACHE,asset))) localMissingItems.push({asset,label:asset});
  for (const record of remotePhotos) if (!(await hasIn(IMAGE_CACHE,record.url))) remoteMissingItems.push(record);
  for (const url of optionalRuntime) if (await hasIn(APP_CACHE,url)) optionalCached++;
  return {
    localTotal:localAssets.length,localMissing:localMissingItems.length,localMissingItems,
    remoteTotal:remotePhotos.length,remoteMissing:remoteMissingItems.length,remoteMissingItems,
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

async function prepareRemoteRecords(records,port,{labelPrefix='正在下載旅程照片…'}={}){
  let done=0,total=records.length;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total,label});
  for(const record of records){
    progress(`${labelPrefix} ${record.label}`);
    await cacheRemotePhoto(record,{attempts:3});
    done++;progress(`${labelPrefix} ${record.label}`);
  }
}
async function prepareOffline(port) {
  const manifest = await readOfflineManifest();
  const localAssets = Array.isArray(manifest.localAssets) ? manifest.localAssets : [];
  const remotePhotos = remotePhotoRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const requiredTotal = localAssets.length + remotePhotos.length;
  let done=0;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total:requiredTotal,label});
  progress('正在準備網頁核心與本地資料…');
  for (const asset of localAssets) {
    try { await cacheLocalAsset(asset); } catch (error) { console.warn('Offline local asset failed',asset,error); }
    done++; progress('正在準備網頁核心與本地資料…');
  }
  for (const record of remotePhotos) {
    progress(`正在下載旅程照片… ${record.label}`);
    await cacheRemotePhoto(record,{attempts:3});
    done++; progress(`正在下載旅程照片… ${record.label}`);
  }
  for (const url of optionalRuntime) await cacheOptionalRuntime(url);
  const result = await checkOffline(manifest);
  await storeOfflineResult(result);
  return result;
}
async function retryMissingRemotePhotos(port){
  const manifest=await readOfflineManifest();
  const before=await checkOffline(manifest);
  const records=before.remoteMissingItems||[];
  let done=0,total=records.length;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total,label});
  if(!records.length)return before;
  for(const record of records){
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
      if(msg.type==='PREPARE_OFFLINE')result=await prepareOffline(port);
      else if(msg.type==='RETRY_OFFLINE_PHOTOS')result=await retryMissingRemotePhotos(port);
      else if(msg.type==='CLEAR_OFFLINE_PHOTOS')result=await clearOfflinePhotos(manifest);
      else if(msg.type==='CLEAR_OFFLINE_DOWNLOADS')result=await clearOfflineDownloads(manifest);
      else result=await checkOffline(manifest);
      port.postMessage({type:'OFFLINE_RESULT',result});
    } catch (error) {
      port.postMessage({type:'OFFLINE_ERROR',error:String(error?.message||error)});
    }
  })());
});
