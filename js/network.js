/* Network profile: International/Mainland connectivity, Leaflet loading and China map coordinate handling. */
(() => {
  'use strict';

  function create({toast}={}){
    const STORAGE_KEY='yunnan-2026-network-profile-v1';
    const DEFAULT_RESET_KEY='yunnan-2026-network-profile-default-intl-20260910';
    const DEFAULT_MODE='international';
    const MODES=new Set(['international','mainland']);
    let mode=DEFAULT_MODE,storageAvailable=true,leafletPromise=null;
    try{
      if(localStorage.getItem(DEFAULT_RESET_KEY)!=='1'){localStorage.setItem(STORAGE_KEY,DEFAULT_MODE);localStorage.setItem(DEFAULT_RESET_KEY,'1');mode=DEFAULT_MODE;}
      else{const saved=localStorage.getItem(STORAGE_KEY);if(MODES.has(saved))mode=saved;}
    }catch{storageAvailable=false;}

    const name=value=>value==='mainland'?'大陸版':'國際版';
    const get=()=>mode;
    const isMainland=()=>mode==='mainland';
    const sync=()=>{document.querySelectorAll('[data-network-profile-select]').forEach(select=>{select.value=mode;});document.documentElement.dataset.networkProfile=mode;};
    const set=value=>{if(!MODES.has(value)||value===mode){sync();return false;}mode=value;try{localStorage.setItem(STORAGE_KEY,mode);storageAvailable=true;}catch{storageAvailable=false;}sync();window.dispatchEvent(new CustomEvent('yunnan:network-profile',{detail:{mode}}));return true;};

    function loadStylesheet(primary,fallback){return new Promise(resolve=>{const existing=document.querySelector('link[data-leaflet-runtime]');if(existing){resolve(true);return;}const link=document.createElement('link');link.rel='stylesheet';link.dataset.leafletRuntime='1';link.href=primary;let retried=false;link.onload=()=>resolve(true);link.onerror=()=>{if(!retried&&fallback){retried=true;link.href=fallback;return;}resolve(false);};document.head.appendChild(link);});}
    function loadScript(primary,fallback){return new Promise((resolve,reject)=>{if(window.L){resolve(true);return;}const existing=document.querySelector('script[data-leaflet-runtime]');if(existing){existing.addEventListener('load',()=>resolve(Boolean(window.L)),{once:true});existing.addEventListener('error',()=>reject(new Error('Leaflet load failed')),{once:true});return;}const script=document.createElement('script');script.dataset.leafletRuntime='1';script.src=primary;script.async=true;let retried=false;script.onload=()=>window.L?resolve(true):reject(new Error('Leaflet unavailable after load'));script.onerror=()=>{if(!retried&&fallback){retried=true;script.src=fallback;return;}reject(new Error('Leaflet load failed'));};document.head.appendChild(script);});}
    function leafletUrls(){
      const intl={css:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',js:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'};
      const cn={css:'https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.css',js:'https://unpkg.com.cn/leaflet@1.9.4/dist/leaflet.js'};
      return isMainland()?{primary:cn,fallback:intl}:{primary:intl,fallback:cn};
    }
    async function loadLeaflet(){
      if(window.L)return true;
      if(leafletPromise)return leafletPromise;
      const urls=leafletUrls();
      leafletPromise=Promise.all([loadStylesheet(urls.primary.css,urls.fallback.css),loadScript(urls.primary.js,urls.fallback.js)]).then(()=>Boolean(window.L)).catch(error=>{console.error(error);toast?.('地圖程式庫載入失敗；下方地點清單仍可使用');return false;}).finally(()=>{if(!window.L)leafletPromise=null;});
      return leafletPromise;
    }

    // GCJ-02 conversion for Mainland AMap tiles. Source coordinates remain WGS84 in trip-data.json.
    const PI=Math.PI,A=6378245.0,EE=0.00669342162296594323;
    const outOfChina=(lat,lng)=>lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271;
    function transformLat(x,y){let ret=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));ret+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;ret+=(20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3;ret+=(160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3;return ret;}
    function transformLng(x,y){let ret=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));ret+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;ret+=(20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3;ret+=(150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3;return ret;}
    function wgs84ToGcj02(lat,lng){lat=Number(lat);lng=Number(lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||outOfChina(lat,lng))return [lat,lng];let dLat=transformLat(lng-105,lat-35),dLng=transformLng(lng-105,lat-35),radLat=lat/180*PI,magic=Math.sin(radLat);magic=1-EE*magic*magic;const sqrtMagic=Math.sqrt(magic);dLat=(dLat*180)/((A*(1-EE))/(magic*sqrtMagic)*PI);dLng=(dLng*180)/(A/sqrtMagic*Math.cos(radLat)*PI);return [lat+dLat,lng+dLng];}
    function gcj02ToWgs84(lat,lng){const [gLat,gLng]=wgs84ToGcj02(lat,lng);return [Number(lat)*2-gLat,Number(lng)*2-gLng];}
    const toMapCoords=(lat,lng)=>isMainland()?wgs84ToGcj02(lat,lng):[Number(lat),Number(lng)];
    const fromMapCoords=(lat,lng)=>isMainland()?gcj02ToWgs84(lat,lng):[Number(lat),Number(lng)];

    function tileConfig(){
      if(isMainland())return {id:'amap',label:'高德底圖',url:'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&size=1&scl=1&style=8&ltype=11',options:{subdomains:'1234',maxZoom:19,attribution:'&copy; 高德地图'}};
      return {id:'osm',label:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',options:{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}};
    }

    sync();
    return {get,name,isMainland,set,sync,loadLeaflet,tileConfig,toMapCoords,fromMapCoords,wgs84ToGcj02,gcj02ToWgs84,isStorageAvailable:()=>storageAvailable};
  }

  window.YunnanNetworkSystem={create};
})();
