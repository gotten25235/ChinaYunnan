/*
  雲南慢時光 Service Worker
  - RELEASE_VERSION 是對外軟體版本；BUILD_ID 是內部部署版本，可在對外版本固定時獨立更新。
  - build.json 是唯一的日常更新探針；版本＋ build 相同時，App Shell 採 Cache First，不背景重抓 JS / CSS / JSON。
  - 新 build 安裝時讀 asset-manifest.json 的 SHA-256：未變的 App Shell 直接從上一版 App Cache 複製，只有變動資源才重新抓取。
  - 圖片使用穩定的 Image Cache，不因一般 build 更新而重新下載。
  - STORAGE_SCHEMA 維持 v1，避免一般升版清空使用者資料與圖片快取。
*/
const RELEASE_VERSION = '1.6.9';
const BUILD_ID = '20260916-175143';
const STORAGE_SCHEMA = 'v1';
const APP_CACHE = `yunnan-app-${RELEASE_VERSION}-${BUILD_ID}`;
const IMAGE_CACHE = `yunnan-images-${STORAGE_SCHEMA}`;
const OFFLINE_META_CACHE = `yunnan-offline-${STORAGE_SCHEMA}`;
const PROJECT_CACHE_PREFIX = 'yunnan-';
const APP_CACHE_PREFIX = 'yunnan-app-';
const BUILD_META_URL = './build.json';
const ASSET_MANIFEST_URL = './asset-manifest.json';
const INVALIDATED_IMAGE_ASSETS = ['./images/remote/souvenir-tamarind.webp','./images/remote/souvenir-wild-mushroom-beer.webp','./images/library/souvenir-tamarind.webp','./images/library/souvenir-wild-mushroom-beer.webp'];

const CORE_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline-manifest.json',
  `./css/style.css?v=${RELEASE_VERSION}`,
  `./css/banner.css?v=${RELEASE_VERSION}`,
  `./js/network.js?v=${RELEASE_VERSION}`,
  `./js/core.js?v=${RELEASE_VERSION}`,
  `./js/analytics.js?v=${RELEASE_VERSION}`,
  `./js/weather.js?v=${RELEASE_VERSION}`,
  `./js/offline.js?v=${RELEASE_VERSION}`,
  `./js/settings.js?v=${RELEASE_VERSION}`,
  `./js/reader.js?v=${RELEASE_VERSION}`,
  `./js/journey.js?v=${RELEASE_VERSION}`,
  `./js/map.js?v=${RELEASE_VERSION}`,
  `./js/library.js?v=${RELEASE_VERSION}`,
  `./js/banner.js?v=${RELEASE_VERSION}`,
  `./js/app.js?v=${RELEASE_VERSION}`,
  './data/trip-data.json',
  './data/social-sources.json',
  './data/source-index.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

function canStore(response) { return !!response && (response.ok || response.type === 'opaque'); }
function appCacheNames(names){return names.filter(name=>name.startsWith(APP_CACHE_PREFIX)&&name!==APP_CACHE);}
async function parseCachedAssetManifest(cacheName){
  try{
    const cache=await caches.open(cacheName);
    const response=await cache.match(ASSET_MANIFEST_URL);
    if(!response?.ok)return null;
    const data=await response.json();
    return data&&typeof data==='object'&&data.assets&&typeof data.assets==='object'?data:null;
  }catch{return null;}
}
async function fetchCurrentAssetManifest(){
  const response=await fetch(`${ASSET_MANIFEST_URL}?b=${encodeURIComponent(BUILD_ID)}`,{cache:'no-store'});
  if(!response.ok)throw new Error(`Asset manifest unavailable: ${response.status}`);
  const data=await response.json();
  if(data?.version!==RELEASE_VERSION||data?.build!==BUILD_ID||!data?.assets)throw new Error('Asset manifest build mismatch');
  return data;
}
async function installAppShell(){
  const cache=await caches.open(APP_CACHE);
  const names=await caches.keys();
  const previousNames=appCacheNames(names).sort().reverse();
  let previousName=null,previousManifest=null,previousCache=null;
  for(const name of previousNames){
    const manifest=await parseCachedAssetManifest(name);
    if(manifest){previousName=name;previousManifest=manifest;previousCache=await caches.open(name);break;}
  }
  const currentManifest=await fetchCurrentAssetManifest();
  for(const asset of CORE_SHELL){
    let reused=false;
    if(previousCache&&previousManifest?.assets?.[asset]&&previousManifest.assets[asset]===currentManifest.assets?.[asset]){
      const cached=await previousCache.match(asset);
      if(cached){await cache.put(asset,cached.clone());reused=true;}
    }
    if(reused)continue;
    const response=await fetch(new Request(asset,{cache:'no-cache'}));
    if(!canStore(response))throw new Error(`Core asset unavailable: ${asset}`);
    await cache.put(asset,response.clone());
  }
  await cache.put(ASSET_MANIFEST_URL,new Response(JSON.stringify(currentManifest),{headers:{'Content-Type':'application/json'}}));
  try{
    const buildResponse=await fetch(`${BUILD_META_URL}?b=${encodeURIComponent(BUILD_ID)}`,{cache:'no-store'});
    if(buildResponse.ok)await cache.put(BUILD_META_URL,buildResponse.clone());
  }catch{}
  return previousName;
}

self.addEventListener('install', event => {
  event.waitUntil((async()=>{await installAppShell();await self.skipWaiting();})());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Legacy builds used yunnan-app-<version> without a build suffix. Force one
    // navigation only for that migration so already-open old pages immediately
    // receive the new build-aware bootstrap. Future builds reload via build.json.
    const legacyUpgrade = names.some(name => /^yunnan-app-\d+\.\d+\.\d+$/.test(name) && name !== APP_CACHE);
    const keep = new Set([APP_CACHE, IMAGE_CACHE, OFFLINE_META_CACHE]);
    await Promise.all(names.map(name => {
      if (name.startsWith(PROJECT_CACHE_PREFIX) && !keep.has(name)) return caches.delete(name);
      return Promise.resolve(false);
    }));
    const imageCache = await caches.open(IMAGE_CACHE);
    await Promise.all(INVALIDATED_IMAGE_ASSETS.map(asset => imageCache.delete(new URL(asset, self.location.href).href)));
    await self.clients.claim();
    if(legacyUpgrade){
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      await Promise.all(windows.map(client=>client.navigate(client.url).catch(()=>null)));
    }
  })());
});

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

async function appCacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request, {cache:'no-cache'});
    if (canStore(response)) eventlessPut(cache, request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html') || await cache.match('./');
      if (fallback) return fallback;
    }
    return new Response('Offline', {status:503,statusText:'Offline'});
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isMapTile(url)) return;
  if (isPhotoRequest(request, url)) { event.respondWith(cacheFirstImage(request)); return; }

  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && /\/build\.json$/i.test(url.pathname)) {
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>new Response('',{status:503,statusText:'Build check unavailable'})));
    return;
  }
  if (sameOrigin && /\/data\/analytics-config\.json$/i.test(url.pathname)) {
    event.respondWith(fetch(request, {cache:'no-store'}).catch(() => new Response('{"enabled":false}', {headers:{'Content-Type':'application/json'}})));
    return;
  }
  const appLike = request.mode === 'navigate' || request.destination === 'document' || request.destination === 'script' || request.destination === 'style' ||
    (sameOrigin && (/\/data\/[^/]+\.json$/i.test(url.pathname) || /\.(?:webmanifest|json)$/i.test(url.pathname)));
  if (appLike) event.respondWith(appCacheFirst(request));
});

async function readOfflineManifest() {
  const cache = await caches.open(APP_CACHE);
  let response = await cache.match('./offline-manifest.json');
  if (!response) response = await fetch('./offline-manifest.json', {cache:'no-store'});
  if (!response || !response.ok) throw new Error('offline-manifest.json unavailable');
  return response.json();
}
function remoteImageRecords(manifest) {
  const values = Array.isArray(manifest.remoteImages) ? manifest.remoteImages : [];
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
  const imageAssets = Array.isArray(manifest.imageAssets) ? manifest.imageAssets : [];
  const remoteImages = remoteImageRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const coreMissingItems=[],photoLocalMissingItems=[],remoteMissingItems=[];
  let optionalCached=0;
  for (const asset of coreAssets) if (!(await hasIn(APP_CACHE,asset))) coreMissingItems.push({asset,label:asset});
  for (const asset of imageAssets) if (!(await hasIn(IMAGE_CACHE,asset))) photoLocalMissingItems.push({asset,label:asset});
  for (const record of remoteImages) if (!(await hasIn(IMAGE_CACHE,record.url))) remoteMissingItems.push(record);
  for (const url of optionalRuntime) if (await hasIn(APP_CACHE,url)) optionalCached++;
  return {
    coreTotal:coreAssets.length,coreMissing:coreMissingItems.length,coreMissingItems,
    photoLocalTotal:imageAssets.length,photoLocalMissing:photoLocalMissingItems.length,photoLocalMissingItems,
    remoteTotal:remoteImages.length,remoteMissing:remoteMissingItems.length,remoteMissingItems,
    photoTotal:imageAssets.length+remoteImages.length,
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
  const imageAssets = Array.isArray(manifest.imageAssets) ? manifest.imageAssets : [];
  const remoteImages = remoteImageRecords(manifest);
  const optionalRuntime = Array.isArray(manifest.optionalRuntime) ? manifest.optionalRuntime : [];
  const total = coreAssets.length + (includePhotos ? imageAssets.length + remoteImages.length : 0);
  let done=0;
  const progress=(label)=>port?.postMessage({type:'OFFLINE_PROGRESS',done,total,label});
  progress('正在準備網頁核心與其他資料…');
  for (const asset of coreAssets) {
    try { await cacheCoreAsset(asset); } catch (error) { console.warn('Offline core asset failed',asset,error); }
    done++; progress('正在準備網頁核心與其他資料…');
  }
  if(includePhotos){
    for (const asset of imageAssets) {
      progress(`正在下載旅行照片… ${asset.split('/').pop()||asset}`);
      try { await cacheLocalPhoto(asset); } catch (error) { console.warn('Offline local photo failed',asset,error); }
      done++; progress(`正在下載旅行照片… ${asset.split('/').pop()||asset}`);
    }
    for (const record of remoteImages) {
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
  if(msg.type==='GET_BUILD_INFO'){port?.postMessage({type:'BUILD_INFO',version:RELEASE_VERSION,build:BUILD_ID});return;}
  if(msg.type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return;}
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
