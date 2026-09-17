/* Weather domain: AMap -> QWeather Weather v1 -> Open-Meteo, one-hour cache, offline fallback and travel alerts. */
(() => {
  'use strict';

  function create(config){
    const {tripData,items,esc,toast,networkProfile,isDev=false}=config;
    const CACHE_KEY='yunnan-weather-cache-v2';
    const CONFIG_KEY='yunnan-weather-provider-config-v1';
    const CACHE_TTL=60*60*1000;
    const AMAP_SOURCE='https://lbs.amap.com/api/webservice/guide/api/weatherinfo';
    const QWEATHER_SOURCE='https://dev.qweather.com/docs/api/weather/weather-daily-forecast/';
    const QWEATHER_HOURLY_SOURCE='https://dev.qweather.com/docs/api/weather/weather-hourly-forecast/';
    const QWEATHER_API_SOURCE='https://dev.qweather.com/docs/api/weather/';
    const OPEN_METEO_SOURCE='https://open-meteo.com/en/docs';
    const OPEN_METEO_CMA_SOURCE='https://open-meteo.com/en/docs/cma-api';
    const OPEN_METEO_ELEVATION_SOURCE='https://open-meteo.com/en/docs/elevation-api';
    const mainAnchorByDay={1:'hotel-kmg-airport',2:'dali-old',3:'lijiang-old',4:'lijiang-old',5:'dukezong',6:'lijiang-old',7:'plaza',8:'plaza'};
    const amapAdcodes={昆明:'530100',大理:'532901',麗江:'530700',香格里拉:'533401'};
    const qweatherPublicByAdcode={
      '530100':'kunming-101290101',
      '532901':'dali-prefecture-101290201',
      '530700':'lijiang-101291401',
      '530721':'yulong-101291406',
      '533401':'shangri-la-city-101291301'
    };
    const specialByDay={
      3:[{key:'anchor-dali-old',itemId:'dali-old',label:'大理',highAltitude:false,amapAdcode:'532901'}],
      4:[{key:'yulong-spruce',itemId:'spruce',label:'玉龍雪山・雲杉坪',highAltitude:true,amapAdcode:'530721'}],
      6:[{key:'pudacuo',itemId:'pudacuo',label:'普達措國家公園',highAltitude:true,amapAdcode:'533401'}],
      7:[{key:'anchor-lijiang-old',itemId:'lijiang-old',label:'麗江',highAltitude:false,amapAdcode:'530700'}]
    };
    const highAltitudeCities=new Set(['香格里拉']);
    let cache={records:{}};
    let providerConfig={amapKey:'',qweatherHost:'',qweatherKey:''};
    let storageAvailable=true,refreshPromise=null,timer=null,liveDateTimer=null,liveDateKey='';

    const xhsPlaceTerms=Object.freeze({
      '昆明':'昆明',
      '大理':'大理',
      '麗江':'丽江',
      '香格里拉':'香格里拉',
      '玉龍雪山・雲杉坪':'玉龙雪山 云杉坪',
      '普達措國家公園':'普达措 国家公园'
    });

    const hasCoords=p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng));
    const dateLabel=date=>String(date||'').slice(5).replace('-','/');
    const fmt=v=>Number.isFinite(Number(v))?Math.round(Number(v)):null;
    const uvEmoji=value=>{const uv=Number(value);if(!Number.isFinite(uv))return '👩‍🦲';if(uv<=2)return '👩🏻‍🦲';if(uv<=5)return '👩🏼‍🦲';if(uv<=7)return '👩🏽‍🦲';if(uv<=10)return '👩🏾‍🦲';return '👩🏿‍🦲';};
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const missing=v=>v===null||v===undefined||v==='';
    const formatUpdate=ms=>{try{return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tripData.timezone}).format(new Date(ms));}catch{return '';}};
    const combineText=(day,night)=>{day=String(day||'').trim();night=String(night||'').trim();if(day&&night&&day!==night)return `${day}轉${night}`;return day||night;};
    const maxFinite=(...values)=>{const nums=values.map(Number).filter(Number.isFinite);return nums.length?Math.max(...nums):null;};
    const minFinite=(...values)=>{const nums=values.map(Number).filter(Number.isFinite);return nums.length?Math.min(...nums):null;};
    const cleanHost=value=>String(value||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'');
    const elevationNumber=value=>Number.isFinite(Number(value))?Number(value):null;
    const formatElevation=value=>{const n=elevationNumber(value);return n===null?'':Math.round(n).toLocaleString('zh-TW');};
    const formatApproxElevation=value=>{const n=elevationNumber(value);return n===null?'':Math.round(n/10)*10;};
    const publicElevationText=value=>{const rounded=formatApproxElevation(value);return rounded===''?'':`海拔：約 ${Number(rounded).toLocaleString('zh-TW')} m`;};
    function liveDate(offsetDays=0){
      const shifted=new Date(Date.now()+Number(offsetDays||0)*86400000),parts={};
      try{
        new Intl.DateTimeFormat('en-US',{timeZone:tripData.timezone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(shifted).forEach(part=>{if(part.type!=='literal')parts[part.type]=part.value;});
      }catch{
        parts.year=String(shifted.getUTCFullYear());parts.month=String(shifted.getUTCMonth()+1).padStart(2,'0');parts.day=String(shifted.getUTCDate()).padStart(2,'0');
      }
      const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day),iso=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      return {year,month,day,iso,label:`${month}/${day}`,keywordDate:`${month}.${day}`};
    }
    function xhsPlaceTerm(point){return xhsPlaceTerms[point?.label]||String(point?.label||'雲南').replace(/麗/g,'丽').replace(/龍/g,'龙').replace(/雲/g,'云').replace(/國/g,'国').replace(/園/g,'园');}
    function xhsDeepLink(keyword){return `xhsdiscover://search/result?keyword=${encodeURIComponent(keyword)}&target_search=notes&source=deeplink`;}
    function xhsSearch(point,date){
      const keyword=`${date.keywordDate} ${xhsPlaceTerm(point)} 实况 穿搭 天气`;
      return {keyword,deeplink:xhsDeepLink(keyword)};
    }
    const liveItemIds=new Set(['snow','spruce','blue-moon','ganhaizi','tiger','songzanlin','pudacuo']);
    const simplifiedText=value=>String(value||'').replace(/[・／/]/g,' ').replace(/麗/g,'丽').replace(/龍/g,'龙').replace(/雲/g,'云').replace(/國/g,'国').replace(/園/g,'园').replace(/鎮/g,'镇').replace(/風/g,'风').replace(/臺/g,'台').replace(/與/g,'与').replace(/\s+/g,' ').trim();
    function itemXhsData(item){
      if(!item?.name)return null;
      const name=simplifiedText(item.name),city=simplifiedText(item.city||''),mode=liveItemIds.has(item.id)?'live':'search',customQuery=simplifiedText(item.xhsQuery||'');
      if(mode==='live'){
        const today=liveDate(0),yesterday=liveDate(-1),keyword=`${today.keywordDate} ${name} 实况 穿搭 天气`,altKeyword=`${yesterday.keywordDate} ${name} 实况 穿搭 天气`;
        return {mode,keyword,deeplink:xhsDeepLink(keyword),context:`${item.name} · ${today.label} 即時實況`,altKeyword,altDeeplink:xhsDeepLink(altKeyword),altLabel:`資料少？改搜 ${yesterday.label}`};
      }
      let keyword=customQuery;
      if(keyword){}
      else if(item.type==='photo')keyword=`${city} ${name} 拍照 机位 构图 姿势`;
      else if(item.type==='food')keyword=`${city} ${name} 推荐 好吃 避雷`;
      else if(item.type==='shopping')keyword=`${name} 云南 推荐 哪里买`;
      else if(item.type==='hotel')keyword=`${name} 酒店 实拍 早餐 隔音`;
      else if(item.type==='night')keyword=`${city} ${name} 夜游 实况 攻略`;
      else keyword=`${city} ${name} 攻略 实况 避雷`;
      keyword=keyword.replace(/\s+/g,' ').trim();
      return {mode,keyword,deeplink:xhsDeepLink(keyword),context:`${item.name} · 小紅書搜尋`};
    }
    function liveSearchHtml(point,tripDay){
      const today=liveDate(0),yesterday=liveDate(-1),todaySearch=xhsSearch(point,today),yesterdaySearch=xhsSearch(point,yesterday),label=esc(point?.label||'此地點'),day=esc(tripDay||'');
      return `<div class="weather-live-links" aria-label="${label} 小紅書近期實況"><span class="weather-live-label">📕 小紅書實況</span><button type="button" class="weather-live-link" data-weather-live-open data-weather-live-keyword="${esc(todaySearch.keyword)}" data-weather-live-deeplink="${esc(todaySearch.deeplink)}" data-weather-live-search="today" data-weather-live-point="${label}" data-weather-live-date="${today.iso}" data-weather-live-trip-day="${day}">${today.label} 現場穿搭 ↗</button><button type="button" class="weather-live-fallback" data-weather-live-open data-weather-live-keyword="${esc(yesterdaySearch.keyword)}" data-weather-live-deeplink="${esc(yesterdaySearch.deeplink)}" data-weather-live-search="yesterday" data-weather-live-point="${label}" data-weather-live-date="${yesterday.iso}" data-weather-live-trip-day="${day}">資料少？看 ${yesterday.label}</button></div>`;
    }
    function copyText(value){
      const text=String(value||'').trim();if(!text)return Promise.reject(new Error('empty'));
      if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
      return new Promise((resolve,reject)=>{const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.appendChild(area);area.select();try{document.execCommand('copy')?resolve():reject(new Error('copy failed'));}catch(error){reject(error);}finally{area.remove();}});
    }
    function openXhs(button){
      const weatherMode=button?.hasAttribute('data-weather-live-open'),deeplink=String(button?.dataset.xhsDeeplink||button?.dataset.weatherLiveDeeplink||''),keyword=String(button?.dataset.xhsKeyword||button?.dataset.weatherLiveKeyword||'');if(!deeplink||!keyword)return false;
      const dialog=document.querySelector('#xhs-live-dialog'),field=document.querySelector('#xhs-live-keyword'),context=document.querySelector('[data-xhs-live-context]'),status=document.querySelector('[data-xhs-live-status]'),title=document.querySelector('[data-xhs-dialog-title]'),alternate=document.querySelector('[data-xhs-alternate]');
      if(!dialog||!field)return false;
      dialog.dataset.deeplink=deeplink;dialog.dataset.keyword=keyword;dialog.dataset.primaryDeeplink=deeplink;dialog.dataset.primaryKeyword=keyword;dialog.dataset.primaryContext=String(button?.dataset.xhsContext||'');dialog.dataset.showingAlternate='0';
      dialog.dataset.altDeeplink=String(button?.dataset.xhsAltDeeplink||'');dialog.dataset.altKeyword=String(button?.dataset.xhsAltKeyword||'');dialog.dataset.altLabel=String(button?.dataset.xhsAltLabel||'');
      field.value=keyword;
      if(title)title.textContent=weatherMode?'📕 小紅書實況':'📕 小紅書搜尋';
      if(context){const custom=String(button?.dataset.xhsContext||'').trim(),point=String(button?.dataset.weatherLivePoint||'').trim(),date=String(button?.dataset.weatherLiveDate||'').slice(5).replace('-','/');context.textContent=custom||[point,date?`${date} 實況搜尋`:null].filter(Boolean).join(' · ');}
      if(alternate){const hasAlt=Boolean(dialog.dataset.altKeyword&&dialog.dataset.altDeeplink);alternate.hidden=!hasAlt;alternate.textContent=dialog.dataset.altLabel||'改搜昨天';}
      if(status)status.textContent='點「開啟小紅書」後會嘗試喚起 App。';
      if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
      return true;
    }
    function alternateXhs(){
      const dialog=document.querySelector('#xhs-live-dialog'),field=document.querySelector('#xhs-live-keyword'),context=document.querySelector('[data-xhs-live-context]'),status=document.querySelector('[data-xhs-live-status]'),button=document.querySelector('[data-xhs-alternate]');if(!dialog||!field||!button||!dialog.dataset.altKeyword)return false;
      const alt=dialog.dataset.showingAlternate!=='1';dialog.dataset.showingAlternate=alt?'1':'0';
      const keyword=alt?dialog.dataset.altKeyword:dialog.dataset.primaryKeyword,deeplink=alt?dialog.dataset.altDeeplink:dialog.dataset.primaryDeeplink;dialog.dataset.keyword=keyword;dialog.dataset.deeplink=deeplink;field.value=keyword;
      button.textContent=alt?'回到今天':(dialog.dataset.altLabel||'改搜昨天');
      if(context&&dialog.dataset.primaryContext)context.textContent=alt?`${dialog.dataset.primaryContext} · 昨日備援`:dialog.dataset.primaryContext;
      if(status)status.textContent=alt?'已切換為昨天的搜尋詞。':'已切回今天的搜尋詞。';
      return true;
    }
    function launchXhs(){
      const dialog=document.querySelector('#xhs-live-dialog'),deeplink=String(dialog?.dataset.deeplink||'');if(!deeplink)return false;
      const status=document.querySelector('[data-xhs-live-status]');
      if(status)status.textContent='正在嘗試開啟小紅書 App…';
      try{window.location.href=deeplink;}catch{if(status)status.textContent='無法喚起小紅書；請確認已安裝 App，或先複製搜尋詞。';}
      setTimeout(()=>{if(dialog?.open&&status)status.textContent='若沒有跳到小紅書，可能未安裝 App 或瀏覽器未允許喚起；可先複製搜尋詞。';},1400);
      return true;
    }
    function copyXhs(){
      const dialog=document.querySelector('#xhs-live-dialog'),keyword=String(dialog?.dataset.keyword||document.querySelector('#xhs-live-keyword')?.value||'');if(!keyword)return false;
      const status=document.querySelector('[data-xhs-live-status]');
      copyText(keyword).then(()=>{if(status)status.textContent='✓ 已複製搜尋詞';toast?.('已複製小紅書搜尋詞');}).catch(()=>{const field=document.querySelector('#xhs-live-keyword');field?.focus();field?.select();if(status)status.textContent='無法自動複製，已選取搜尋詞。';});
      return true;
    }

    try{
      const raw=localStorage.getItem(CACHE_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&parsed.records)cache=parsed;}
      const configRaw=localStorage.getItem(CONFIG_KEY);if(configRaw){const parsed=JSON.parse(configRaw);if(parsed&&typeof parsed==='object')providerConfig={amapKey:String(parsed.amapKey||''),qweatherHost:cleanHost(parsed.qweatherHost),qweatherKey:String(parsed.qweatherKey||'')};}
    }catch{storageAvailable=false;}
    function saveCache(){if(!storageAvailable)return;try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch{storageAvailable=false;}}
    function saveProviderConfig(){if(!storageAvailable)return;try{localStorage.setItem(CONFIG_KEY,JSON.stringify(providerConfig));}catch{storageAvailable=false;}}
    const configSignature=()=>`amap:${providerConfig.amapKey?'1':'0'}|qw:${providerConfig.qweatherHost&&providerConfig.qweatherKey?'1':'0'}|host:${providerConfig.qweatherHost||'-'}`;

    function mainPointForDay(day){
      const itemId=mainAnchorByDay[day.day],item=items[itemId];
      if(!hasCoords(item))return null;
      return {key:`anchor-${itemId}`,itemId,label:day.city,lat:Number(item.lat),lng:Number(item.lng),highAltitude:highAltitudeCities.has(day.city),amapAdcode:amapAdcodes[day.city]||''};
    }
    function specialsForDay(day){return (specialByDay[day.day]||[]).map(def=>{const p=items[def.itemId];return hasCoords(p)?{...def,lat:Number(p.lat),lng:Number(p.lng)}:null;}).filter(Boolean);}
    function itinerarySequence(day){
      const ids=[...(Array.isArray(day?.itinerary)?day.itinerary:[])];
      if(day?.hotel)ids.push(day.hotel);
      return ids.map((id,index)=>({id,index,item:items[id]})).filter(entry=>entry.item);
    }
    function pointJourneyRank(point,day){
      const sequence=itinerarySequence(day);
      if(!sequence.length)return Number.MAX_SAFE_INTEGER;
      const exact=sequence.find(entry=>entry.id===point.itemId);
      if(exact)return exact.index;
      const pointCity=String(items[point.itemId]?.city||point.label||'').trim();
      const cityMatch=sequence.find(entry=>String(entry.item?.city||'').trim()===pointCity);
      return cityMatch?cityMatch.index:Number.MAX_SAFE_INTEGER;
    }
    function pointsForDay(day){
      const main=mainPointForDay(day),points=[...(main?[main]:[]),...specialsForDay(day)];
      return points.map((point,index)=>({point,index,rank:pointJourneyRank(point,day)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.point);
    }
    function allPoints(){const out=new Map();tripData.days.forEach(day=>pointsForDay(day).forEach(p=>out.set(p.key,p)));return [...out.values()];}

    function normalizeAmap(json){
      const forecast=Array.isArray(json?.forecasts)?json.forecasts[0]:null,casts=forecast?.casts;if(String(json?.status)!=='1'||!Array.isArray(casts))return {};
      const out={};casts.forEach(entry=>{const date=String(entry?.date||'').slice(0,10);if(!date)return;const dayTemp=entry?.daytemp??entry?.dayTemp,nightTemp=entry?.nighttemp??entry?.nightTemp;out[date]={date,weatherText:combineText(entry?.dayweather??entry?.dayWeather,entry?.nightweather??entry?.nightWeather),max:maxFinite(dayTemp,nightTemp),min:minFinite(dayTemp,nightTemp),windText:[entry?.daywind??entry?.dayWind,entry?.daypower??entry?.dayPower].filter(Boolean).join(' '),source:'amap'};});return out;
    }
    async function fetchAmap(point){
      if(!providerConfig.amapKey||!point.amapAdcode)throw new Error('AMap not configured for this point');
      const url=new URL('https://restapi.amap.com/v3/weather/weatherInfo');url.searchParams.set('city',point.amapAdcode);url.searchParams.set('extensions','all');url.searchParams.set('output','JSON');url.searchParams.set('key',providerConfig.amapKey);
      const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`AMap HTTP ${response.status}`);const json=await response.json(),daily=normalizeAmap(json);if(!Object.keys(daily).length)throw new Error(json?.info||'AMap weather unavailable');return {provider:'amap',daily};
    }

    function qweatherProbability(part){const p=Number(part?.precipitation?.probability);return Number.isFinite(p)?p*100:null;}
    function qweatherWindKmh(part){const speed=Number(part?.wind?.speed?.value),unit=String(part?.wind?.speed?.unit||'').toLowerCase();if(!Number.isFinite(speed))return null;return unit.includes('m/s')?speed*3.6:speed;}
    function normalizeQWeatherV1(json){
      const days=json?.days;if(!Array.isArray(days))return {};
      const out={};days.forEach(entry=>{const date=String(entry?.forecastStartTime||'').slice(0,10);if(!date)return;const daytime=entry?.daytime||{},nighttime=entry?.nighttime||{};out[date]={date,weatherText:combineText(daytime?.condition?.text,nighttime?.condition?.text),max:fmt(entry?.temperatureMax?.value),min:fmt(entry?.temperatureMin?.value),rain:maxFinite(qweatherProbability(daytime),qweatherProbability(nighttime)),wind:maxFinite(qweatherWindKmh(daytime),qweatherWindKmh(nighttime)),windText:String(daytime?.wind?.direction?.compass||'').toUpperCase(),uv:fmt(entry?.uvIndexMax),source:'qweather'};});return out;
    }
    async function fetchQWeather(point){
      const host=cleanHost(providerConfig.qweatherHost),key=providerConfig.qweatherKey;if(!host||!key)throw new Error('QWeather not configured');
      const url=new URL(`/weather/v1/daily/${Number(point.lat).toFixed(2)}/${Number(point.lng).toFixed(2)}`,`https://${host}`);url.searchParams.set('days','10');url.searchParams.set('localTime','true');url.searchParams.set('lang','zh');url.searchParams.set('key',key);
      const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`QWeather Weather v1 HTTP ${response.status}`);const json=await response.json(),daily=normalizeQWeatherV1(json);if(!Object.keys(daily).length)throw new Error('QWeather Weather v1 payload unavailable');return {provider:'qweather',daily};
    }

    function openMeteoUrl(point){
      const url=new URL('https://api.open-meteo.com/v1/forecast');url.searchParams.set('latitude',String(point.lat));url.searchParams.set('longitude',String(point.lng));url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max');url.searchParams.set('timezone',tripData.timezone||'Asia/Shanghai');url.searchParams.set('forecast_days','16');return url.toString();
    }
    function normalizeOpenMeteo(json){const d=json?.daily;if(!d?.time)return {};const out={};d.time.forEach((date,i)=>{out[date]={date,code:d.weather_code?.[i],max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],apparentMax:d.apparent_temperature_max?.[i],apparentMin:d.apparent_temperature_min?.[i],rain:d.precipitation_probability_max?.[i],wind:d.wind_speed_10m_max?.[i],uv:d.uv_index_max?.[i],source:'open-meteo'};});return out;}
    async function fetchOpenMeteo(point){const response=await fetch(openMeteoUrl(point),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`);const json=await response.json();if(json?.error)throw new Error(json.reason||'Open-Meteo API error');return {provider:'open-meteo',daily:normalizeOpenMeteo(json),elevation:elevationNumber(json?.elevation)};}

    function mergePreferred(primary={},fallback={}){
      const out={};new Set([...Object.keys(primary),...Object.keys(fallback)]).forEach(date=>{const a=primary[date]||{},b=fallback[date]||{},merged={...a,date};for(const [key,value] of Object.entries(b)){if(key==='date'||key==='source')continue;if(missing(merged[key])&& !missing(value))merged[key]=value;}const sources=[...(Array.isArray(a.sources)?a.sources:(a.source?[a.source]:[])),...(Array.isArray(b.sources)?b.sources:(b.source?[b.source]:[]))];merged.sources=[...new Set(sources)];out[date]=merged;});return out;
    }
    async function fetchPoint(point){
      const fetchedAt=Date.now(),tasks=[providerConfig.amapKey&&point.amapAdcode?fetchAmap(point):Promise.reject(new Error('AMap skipped')),providerConfig.qweatherHost&&providerConfig.qweatherKey?fetchQWeather(point):Promise.reject(new Error('QWeather skipped')),fetchOpenMeteo(point)],results=await Promise.allSettled(tasks),fulfilled=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if(!fulfilled.length)throw new Error('All weather providers failed');let daily={};const used=[];['amap','qweather','open-meteo'].forEach(provider=>{const result=fulfilled.find(x=>x.provider===provider);if(result){daily=mergePreferred(daily,result.daily);used.push(provider);}});const openMeteo=fulfilled.find(x=>x.provider==='open-meteo'),elevation=elevationNumber(openMeteo?.elevation);return {fetchedAt,lat:point.lat,lng:point.lng,label:point.label,provider:used.join('+'),providers:used,configSig:configSignature(),daily,elevation,elevationSource:elevation===null?'':'open-meteo-dem'};
    }
    function isFresh(point){const r=cache.records?.[point.key],fetched=Number(r?.fetchedAt||0);return fetched>0&&r?.configSig===configSignature()&&Date.now()-fetched<CACHE_TTL;}

    async function refresh(force=false){
      if(refreshPromise)return refreshPromise;if(!navigator.onLine){hydrate();if(force)toast?.('目前離線，先顯示最後一次天氣快取');return false;}const targets=allPoints().filter(p=>force||!isFresh(p));if(!targets.length){hydrate();if(force)toast?.('天氣已是最新資料');return true;}
      refreshPromise=(async()=>{let success=0;for(const point of targets){try{cache.records[point.key]=await fetchPoint(point);success++;}catch(error){console.warn('Weather update failed',point.key,error);}await sleep(180);}if(success)saveCache();hydrate();if(force)toast?.(success?`天氣已更新（${success} 個區域）`:'天氣更新失敗，保留最後一次快取');return success>0;})().finally(()=>{refreshPromise=null;});return refreshPromise;
    }

    function codeInfo(code){const c=Number(code);if(c===0)return {icon:'☀️',label:'晴朗'};if(c===1)return {icon:'🌤️',label:'大致晴朗'};if(c===2)return {icon:'⛅',label:'局部多雲'};if(c===3)return {icon:'☁️',label:'陰天'};if(c===45||c===48)return {icon:'🌫️',label:'霧'};if([51,53,55,56,57].includes(c))return {icon:'🌦️',label:'毛毛雨'};if([61,63,65,66,67].includes(c))return {icon:'🌧️',label:'雨'};if([71,73,75,77].includes(c))return {icon:'🌨️',label:'雪'};if([80,81,82].includes(c))return {icon:'🌦️',label:'陣雨'};if([85,86].includes(c))return {icon:'🌨️',label:'陣雪'};if([95,96,99].includes(c))return {icon:'⛈️',label:'雷雨'};return {icon:'🌤️',label:'天氣'};}
    function weatherInfo(f){const text=String(f?.weatherText||'').trim();if(!text)return codeInfo(f?.code);const t=text.replace(/陰/g,'阴').replace(/雲/g,'云').replace(/霧/g,'雾');if(t.includes('雷'))return {icon:'⛈️',label:text};if(t.includes('雪'))return {icon:'🌨️',label:text};if(t.includes('雨'))return {icon:'🌧️',label:text};if(t.includes('雾'))return {icon:'🌫️',label:text};if(t.includes('阴'))return {icon:'☁️',label:text};if(t.includes('多云'))return {icon:'⛅',label:text};if(t.includes('晴'))return {icon:'☀️',label:text};return {icon:'🌤️',label:text};}
    function getForecast(point,date){return cache.records?.[point?.key]?.daily?.[date]||null;}
    function pointRecord(point){return cache.records?.[point?.key]||null;}
    function pointElevation(point){return elevationNumber(pointRecord(point)?.elevation);}
    function pointElevationHtml(point){const text=publicElevationText(pointElevation(point));return text?`<span class="weather-elevation">🏔 ${esc(text)}</span>`:'';}
    function pointUpdate(point){return Number(pointRecord(point)?.fetchedAt||0);}
    function alertMessages(forecast,{highAltitude=false}={}){if(!forecast)return [];const out=[],rain=fmt(forecast.rain),cold=fmt(forecast.apparentMin??forecast.min),wind=fmt(forecast.wind),uv=fmt(forecast.uv);if(highAltitude)out.push('🏔 高海拔，天氣變化快；建議保暖並量力活動');if(rain!==null&&rain>=60)out.push('☂ 降雨機率高，建議準備折傘或雨衣');if(cold!==null&&cold<=8)out.push('🧥 體感偏冷，建議增加保暖與防風層');if(wind!==null&&wind>=30)out.push('🌬 風勢較強，帽子與隨身物請固定好');if(uv!==null&&uv>=6)out.push('☀ UV 偏高，建議防曬與遮陽');return [...new Set(out)];}
    function compactForecast(point,date){const f=getForecast(point,date);if(!f)return null;const info=weatherInfo(f),max=fmt(f.max),min=fmt(f.min),rain=fmt(f.rain);if(max===null||min===null)return null;return {f,info,max,min,rain};}

    function daySummaryPlaceholder(day){return `<span class="weather-inline" data-weather-day-summary="${day.day}" aria-live="polite">⌁ 天氣載入中</span>`;}
    function dayPanelPlaceholder(day){return `<section class="weather-panel journey-subcard" data-weather-day-panel="${day.day}" aria-live="polite"><div class="weather-loading">⌁ 正在取得 ${esc(day.city)} 天氣…</div></section>`;}
    function mapPlaceholder(place,dayValue='all'){return `<div class="map-weather-box" data-weather-map-place="${esc(place.id)}" data-weather-map-day="${esc(dayValue)}" aria-live="polite">⌁ 旅程日天氣載入中</div>`;}
    function noForecastText(date){const hasAny=Object.values(cache.records||{}).some(r=>r?.daily&&Object.keys(r.daily).length);return hasAny?`目前預報範圍尚未涵蓋 ${dateLabel(date)}`:'天氣資料尚未取得；連線後可更新';}
    function summaryHtml(day){const point=pointsForDay(day)[0]||null,c=compactForecast(point,day.date);if(!point||!c)return `<span class="weather-inline-empty">⌁ ${esc(noForecastText(day.date))}</span>`;const elevation=pointElevation(point),elevationText=elevation===null?'':Number(formatApproxElevation(elevation)).toLocaleString('zh-TW'),uv=fmt(c.f.uv);return `<span class="weather-inline-main"><span class="weather-inline-icon" aria-hidden="true">${c.info.icon}</span><strong>${c.max}° / ${c.min}°</strong><span>${esc(c.info.label)}</span></span><span class="weather-inline-metrics">${elevationText?`<span>🏔 海拔約 ${elevationText} m</span>`:''}${c.rain!==null?`<span>☂ ${c.rain}%</span>`:''}${uv!==null?`<span>${uvEmoji(uv)} UV ${uv}</span>`:''}</span>`;}
    function weatherRow(point,date,{primary=false,tripDay=''}={}){const c=compactForecast(point,date),live=liveSearchHtml(point,tripDay),elevation=pointElevationHtml(point);if(!c)return `<div class="weather-row ${primary?'weather-row--primary':''}"><div class="weather-row-main"><div><strong>${esc(point.label)}</strong><small>${esc(noForecastText(date))}</small></div></div>${elevation?`<div class="weather-metrics">${elevation}</div>`:''}${live}</div>`;const apparentLow=fmt(c.f.apparentMin),wind=fmt(c.f.wind),uv=fmt(c.f.uv),windText=String(c.f.windText||'').trim();return `<div class="weather-row ${primary?'weather-row--primary':''}"><div class="weather-row-main"><span class="weather-row-icon" aria-hidden="true">${c.info.icon}</span><div><strong>${esc(point.label)}</strong><small>${esc(c.info.label)} · ${esc(dateLabel(date))}</small></div></div><div class="weather-temps"><b>${c.max}°</b><span>/ ${c.min}°</span></div><div class="weather-metrics">${elevation}${c.rain!==null?`<span>☂ ${c.rain}%</span>`:''}${apparentLow!==null?`<span>體感低 ${apparentLow}°</span>`:''}${wind!==null?`<span>風 ${wind} km/h</span>`:(windText?`<span>${esc(windText)}</span>`:'')}${uv!==null?`<span>${uvEmoji(uv)} UV ${uv}</span>`:''}</div>${live}</div>`;}
    const providerLabel=id=>id==='amap'?'高德天氣':id==='qweather'?'QWeather':id==='open-meteo'?'Open-Meteo':id;
    function qweatherPublicWeatherUrl(point){const slug=qweatherPublicByAdcode[String(point.amapAdcode||'')];return slug?`https://www.qweather.com/weather/${slug}.html`:'https://www.qweather.com/';}
    function openMeteoElevationUrl(point){const url=new URL('https://api.open-meteo.com/v1/elevation');url.searchParams.set('latitude',String(point.lat));url.searchParams.set('longitude',String(point.lng));return url.toString();}
    async function fetchElevation(point){const cached=pointElevation(point);if(cached!==null)return cached;const response=await fetch(openMeteoElevationUrl(point),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo elevation HTTP ${response.status}`);const json=await response.json();if(json?.error)throw new Error(json.reason||'Open-Meteo elevation API error');return elevationNumber(Array.isArray(json?.elevation)?json.elevation[0]:null);}
    function elevationDetailText(value){const text=publicElevationText(value);return text?` · ${esc(text)}`:'';}
    function amapDetailUrl(point,extensions){
      const url=new URL('https://restapi.amap.com/v3/weather/weatherInfo');url.searchParams.set('city',String(point.amapAdcode||''));url.searchParams.set('extensions',extensions);url.searchParams.set('output','JSON');url.searchParams.set('key',providerConfig.amapKey);return url.toString();
    }
    function ensureAmapDialog(){
      let dialog=document.querySelector('#amap-weather-dialog');if(dialog)return dialog;
      document.body.insertAdjacentHTML('beforeend',`<dialog id="amap-weather-dialog" class="weather-detail-dialog"><div class="weather-detail-shell"><header><div><span class="eyebrow">AMAP · FULL FORECAST</span><h2 data-weather-detail-title>完整天氣</h2></div><button type="button" class="weather-detail-close" data-weather-detail-close aria-label="關閉完整天氣">×</button></header><div class="weather-detail-body" data-weather-detail-body><p>正在取得預報…</p></div></div></dialog>`);
      return document.querySelector('#amap-weather-dialog');
    }
    function renderAmapDetail(liveJson,forecastJson,point,elevation=null){
      const live=Array.isArray(liveJson?.lives)?liveJson.lives[0]:null,forecast=Array.isArray(forecastJson?.forecasts)?forecastJson.forecasts[0]:null,casts=Array.isArray(forecast?.casts)?forecast.casts:[];
      const liveWeather=String(live?.weather||'').trim(),liveInfo=liveWeather?weatherInfo({weatherText:liveWeather}):{icon:'🌤️',label:'天氣'},temp=fmt(live?.temperature),humidity=fmt(live?.humidity),windDir=String(live?.winddirection||'').trim(),windPower=String(live?.windpower||'').trim();
      const dailyRows=casts.map(entry=>{const text=combineText(entry?.dayweather,entry?.nightweather),info=weatherInfo({weatherText:text}),hi=maxFinite(entry?.daytemp,entry?.nighttemp),lo=minFinite(entry?.daytemp,entry?.nighttemp),wind=[entry?.daywind,entry?.daypower?`${entry.daypower}級`:null].filter(Boolean).join(' ');return `<tr><th>${esc(dateLabel(entry?.date||''))}</th><td>${info.icon} ${esc(info.label)}</td><td><b>${hi===null?'—':fmt(hi)+'°'}</b> / ${lo===null?'—':fmt(lo)+'°'}</td><td>${esc(wind||'—')}</td></tr>`;}).join('');
      const report=String(live?.reporttime||forecast?.reporttime||'').trim();
      const elevationText=elevationDetailText(elevation);
      const currentHtml=live?`<section class="weather-detail-current"><span class="weather-detail-current-icon">${liveInfo.icon}</span><div><strong>${temp===null?'—':temp+'°'} · ${esc(liveInfo.label)}</strong><small>${esc(point.label)}${elevationText}${humidity===null?'':` · 濕度 ${humidity}%`}${windDir||windPower?` · ${esc([windDir,windPower?windPower+'級':''].filter(Boolean).join(' '))}`:''}</small></div></section>`:`<section class="weather-detail-current"><span class="weather-detail-current-icon">🌤️</span><div><strong>即時天氣目前無資料</strong><small>${esc(point.label)}${elevationText}</small></div></section>`;
      const forecastHtml=dailyRows?`<section><h3>短期預報</h3><div class="weather-detail-table-wrap"><table class="weather-detail-table"><thead><tr><th>日期</th><th>天氣</th><th>高 / 低</th><th>風向 / 風力</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section>`:`<section><h3>短期預報</h3><p>高德目前沒有回傳可顯示的預報資料。</p></section>`;
      return `${currentHtml}${forecastHtml}<p class="small weather-detail-attribution">資料來源：高德天氣 API。海拔來源：Open-Meteo Elevation API（Copernicus DEM 90 m）。${report?`資料發布時間：${esc(report)}。`:''}高德公開 Weather API 提供實況與短期逐日預報，不提供本站 Open-Meteo 檢視器的 16 天／逐時欄位。</p>`;
    }
    async function openAmapDetail(button){
      const point=allPoints().find(p=>p.key===String(button?.dataset.weatherPointKey||''));if(!point)return false;const dialog=ensureAmapDialog(),title=dialog.querySelector('[data-weather-detail-title]'),body=dialog.querySelector('[data-weather-detail-body]');if(title)title.textContent=`${point.label} · 高德天氣`;if(body)body.innerHTML='<p>正在取得完整預報…</p>';if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
      if(!providerConfig.amapKey){if(body)body.innerHTML='<p><b>尚未設定高德 Web Service Key。</b></p><p class="small">請到「設定 → 天氣 API 設定」填入高德 Web Service Key；設定完成後即可在這裡直接查看高德實況與短期預報。</p>';return true;}
      if(!point.amapAdcode){if(body)body.innerHTML='<p>此地點目前沒有設定高德 adcode，無法查詢高德天氣。</p>';return true;}
      try{
        const [liveResponse,forecastResponse,elevation]=await Promise.all([fetch(amapDetailUrl(point,'base'),{headers:{Accept:'application/json'}}),fetch(amapDetailUrl(point,'all'),{headers:{Accept:'application/json'}}),fetchElevation(point).catch(()=>pointElevation(point))]);
        if(!liveResponse.ok||!forecastResponse.ok)throw new Error(`HTTP ${liveResponse.status}/${forecastResponse.status}`);
        const [liveJson,forecastJson]=await Promise.all([liveResponse.json(),forecastResponse.json()]);
        if(String(liveJson?.status)!=='1'||String(forecastJson?.status)!=='1')throw new Error(liveJson?.info||forecastJson?.info||'AMap weather unavailable');
        if(body)body.innerHTML=renderAmapDetail(liveJson,forecastJson,point,elevation);
      }catch(error){if(body)body.innerHTML=`<p>高德天氣目前無法載入。${navigator.onLine?'請確認 Web Service Key、配額與網路後再試。':'目前裝置離線。'}</p>`;console.warn('AMap detail failed',error);}return true;
    }
    function openMeteoDetailUrl(point){
      const url=new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude',String(point.lat));url.searchParams.set('longitude',String(point.lng));
      url.searchParams.set('current','temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m');
      url.searchParams.set('hourly','temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m');
      url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max');
      url.searchParams.set('timezone',tripData.timezone||'Asia/Shanghai');url.searchParams.set('forecast_days','16');return url.toString();
    }
    function openMeteoCmaDetailUrl(point){
      const url=new URL('https://api.open-meteo.com/v1/cma');
      url.searchParams.set('latitude',String(point.lat));url.searchParams.set('longitude',String(point.lng));
      url.searchParams.set('hourly','temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation');
      url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max');
      url.searchParams.set('timezone',tripData.timezone||'Asia/Shanghai');url.searchParams.set('forecast_days','10');return url.toString();
    }
    function ensureOpenMeteoDialog(){
      let dialog=document.querySelector('#open-meteo-weather-dialog');if(dialog)return dialog;
      document.body.insertAdjacentHTML('beforeend',`<dialog id="open-meteo-weather-dialog" class="weather-detail-dialog"><div class="weather-detail-shell"><header><div><span class="eyebrow">OPEN-METEO · FULL FORECAST</span><h2 data-weather-detail-title>完整天氣</h2></div><button type="button" class="weather-detail-close" data-weather-detail-close aria-label="關閉完整天氣">×</button></header><div class="weather-detail-body" data-weather-detail-body><p>正在取得預報…</p></div></div></dialog>`);
      return document.querySelector('#open-meteo-weather-dialog');
    }
    function localHourKey(){
      try{const parts={};new Intl.DateTimeFormat('en-CA',{timeZone:tripData.timezone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).forEach(part=>{if(part.type!=='literal')parts[part.type]=part.value;});return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;}catch{return '';}
    }
    function renderOpenMeteoDetail(json,point){
      const current=json?.current||{},currentInfo=codeInfo(current.weather_code),daily=json?.daily||{},hourly=json?.hourly||{},nowKey=localHourKey();
      const dailyRows=(daily.time||[]).slice(0,16).map((date,i)=>{const info=codeInfo(daily.weather_code?.[i]);return `<tr><th>${esc(dateLabel(date))}</th><td>${info.icon} ${esc(info.label)}</td><td><b>${fmt(daily.temperature_2m_max?.[i])??'—'}°</b> / ${fmt(daily.temperature_2m_min?.[i])??'—'}°</td><td>${fmt(daily.precipitation_probability_max?.[i])??'—'}%</td><td>${fmt(daily.wind_speed_10m_max?.[i])??'—'} km/h</td></tr>`;}).join('');
      let start=(hourly.time||[]).findIndex(value=>String(value)>=nowKey);if(start<0)start=0;const hourlyRows=(hourly.time||[]).slice(start,start+24).map((time,offset)=>{const i=start+offset,info=codeInfo(hourly.weather_code?.[i]);return `<tr><th>${esc(String(time).slice(5,16).replace('T',' '))}</th><td>${info.icon} ${esc(info.label)}</td><td>${fmt(hourly.temperature_2m?.[i])??'—'}°</td><td>${fmt(hourly.apparent_temperature?.[i])??'—'}°</td><td>${fmt(hourly.precipitation_probability?.[i])??'—'}%</td></tr>`;}).join('');
      const temp=fmt(current.temperature_2m),apparent=fmt(current.apparent_temperature),humidity=fmt(current.relative_humidity_2m),wind=fmt(current.wind_speed_10m),elevation=elevationNumber(json?.elevation),elevationText=elevationDetailText(elevation);
      return `<section class="weather-detail-current"><span class="weather-detail-current-icon">${currentInfo.icon}</span><div><strong>${temp===null?'—':temp+'°'} · ${esc(currentInfo.label)}</strong><small>${esc(point.label)}${elevationText}${apparent===null?'':` · 體感 ${apparent}°`}${humidity===null?'':` · 濕度 ${humidity}%`}${wind===null?'':` · 風 ${wind} km/h`}</small></div></section><section><h3>未來 16 天</h3><div class="weather-detail-table-wrap"><table class="weather-detail-table"><thead><tr><th>日期</th><th>天氣</th><th>高 / 低</th><th>降雨</th><th>最大風速</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section><section><h3>接下來 24 小時</h3><div class="weather-detail-table-wrap"><table class="weather-detail-table"><thead><tr><th>時間</th><th>天氣</th><th>溫度</th><th>體感</th><th>降雨</th></tr></thead><tbody>${hourlyRows}</tbody></table></div></section><p class="small weather-detail-attribution">資料來源：Open-Meteo。海拔採 Open-Meteo / Copernicus DEM 90 m 數值高程模型；此頁直接讀取指定座標的逐日／逐時預報。</p>`;
    }
    function renderOpenMeteoCmaDetail(json,point){
      const daily=json?.daily||{},hourly=json?.hourly||{},times=hourly.time||[],nowKey=localHourKey();let start=times.findIndex(value=>String(value)>=nowKey);if(start<0)start=0;
      const info=codeInfo(hourly.weather_code?.[start]),temp=fmt(hourly.temperature_2m?.[start]),apparent=fmt(hourly.apparent_temperature?.[start]),humidity=fmt(hourly.relative_humidity_2m?.[start]),wind=fmt(hourly.wind_speed_10m?.[start]),elevation=elevationNumber(json?.elevation),elevationText=elevationDetailText(elevation),modelTime=times[start]?String(times[start]).slice(5,16).replace('T',' '):'';
      const dailyRows=(daily.time||[]).slice(0,10).map((date,i)=>{const dayInfo=codeInfo(daily.weather_code?.[i]);const precipitation=Number(daily.precipitation_sum?.[i]);return `<tr><th>${esc(dateLabel(date))}</th><td>${dayInfo.icon} ${esc(dayInfo.label)}</td><td><b>${fmt(daily.temperature_2m_max?.[i])??'—'}°</b> / ${fmt(daily.temperature_2m_min?.[i])??'—'}°</td><td>${Number.isFinite(precipitation)?precipitation.toFixed(1):'—'} mm</td><td>${fmt(daily.wind_speed_10m_max?.[i])??'—'} km/h</td></tr>`;}).join('');
      const hourlyRows=times.slice(start,start+8).map((time,offset)=>{const i=start+offset,rowInfo=codeInfo(hourly.weather_code?.[i]),precipitation=Number(hourly.precipitation?.[i]);return `<tr><th>${esc(String(time).slice(5,16).replace('T',' '))}</th><td>${rowInfo.icon} ${esc(rowInfo.label)}</td><td>${fmt(hourly.temperature_2m?.[i])??'—'}°</td><td>${fmt(hourly.apparent_temperature?.[i])??'—'}°</td><td>${Number.isFinite(precipitation)?precipitation.toFixed(1):'—'} mm</td></tr>`;}).join('');
      return `<section class="weather-detail-current"><span class="weather-detail-current-icon">${info.icon}</span><div><strong>${temp===null?'—':temp+'°'} · ${esc(info.label)}</strong><small>${esc(point.label)}${elevationText}${apparent===null?'':` · 體感 ${apparent}°`}${humidity===null?'':` · 濕度 ${humidity}%`}${wind===null?'':` · 風 ${wind} km/h`}${modelTime?` · 模型時次 ${esc(modelTime)}`:''}</small></div></section><section><h3>未來 10 天</h3><div class="weather-detail-table-wrap"><table class="weather-detail-table"><thead><tr><th>日期</th><th>天氣</th><th>高 / 低</th><th>降水量</th><th>最大風速</th></tr></thead><tbody>${dailyRows}</tbody></table></div></section><section><h3>接下來約 24 小時</h3><div class="weather-detail-table-wrap"><table class="weather-detail-table"><thead><tr><th>時間</th><th>天氣</th><th>溫度</th><th>體感</th><th>降水量</th></tr></thead><tbody>${hourlyRows}</tbody></table></div></section><p class="small weather-detail-attribution">資料來源：Open-Meteo / CMA GRAPES GFS。CMA 原生模式約 15 km、3 小時間隔，最長約 10 天；海拔採 Open-Meteo / Copernicus DEM 90 m。此入口只作模型對照，不加入本站主天氣的高德 → QWeather → Open-Meteo 欄位優先合併。</p>`;
    }
    async function openOpenMeteoDetail(button){
      const point=allPoints().find(p=>p.key===String(button?.dataset.weatherPointKey||''));if(!point)return false;const dialog=ensureOpenMeteoDialog(),title=dialog.querySelector('[data-weather-detail-title]'),body=dialog.querySelector('[data-weather-detail-body]');if(title)title.textContent=`${point.label} · Open-Meteo`;if(body)body.innerHTML='<p>正在取得完整預報…</p>';if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
      try{const response=await fetch(openMeteoDetailUrl(point),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const json=await response.json();if(json?.error)throw new Error(json.reason||'Open-Meteo API error');if(body)body.innerHTML=renderOpenMeteoDetail(json,point);}catch(error){if(body)body.innerHTML=`<p>Open-Meteo 預報目前無法載入。${navigator.onLine?'請稍後再試。':'目前裝置離線。'}</p>`;console.warn('Open-Meteo detail failed',error);}return true;
    }
    async function openOpenMeteoCmaDetail(button){
      const point=allPoints().find(p=>p.key===String(button?.dataset.weatherPointKey||''));if(!point)return false;const dialog=ensureOpenMeteoDialog(),title=dialog.querySelector('[data-weather-detail-title]'),body=dialog.querySelector('[data-weather-detail-body]');if(title)title.textContent=`${point.label} · Open-Meteo (CMA)`;if(body)body.innerHTML='<p>正在取得 CMA GRAPES GFS 預報…</p>';if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
      try{const response=await fetch(openMeteoCmaDetailUrl(point),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const json=await response.json();if(json?.error)throw new Error(json.reason||'Open-Meteo CMA API error');if(body)body.innerHTML=renderOpenMeteoCmaDetail(json,point);}catch(error){if(body)body.innerHTML=`<p><b>Open-Meteo (CMA) 模型目前無法取得。</b></p><p class="small">${navigator.onLine?'CMA 開放資料服務偶爾可能無法即時取得，請稍後再試；原本高德、QWeather 與 Open-Meteo 不受影響。':'目前裝置離線。'}</p>`;console.warn('Open-Meteo CMA detail failed',error);}return true;
    }
    function publicSourceLinks(point){const label=esc(point.label||'此地點');return `<span class="weather-source-location"><b>${label}</b><span class="weather-source-prefix">查看完整天氣：</span><span class="weather-source-links"><button type="button" class="weather-source-linklike" data-weather-open-amap-detail data-weather-point-key="${esc(point.key)}" title="在本站查看 ${label} 的高德實況與短期預報">高德天氣 ↗</button><a href="${esc(qweatherPublicWeatherUrl(point))}" target="_blank" rel="noopener noreferrer" title="在 QWeather 查看 ${label} 天氣">QWeather ↗</a><button type="button" class="weather-source-linklike" data-weather-open-meteo-detail data-weather-point-key="${esc(point.key)}" title="在本站查看 ${label} 的 Open-Meteo 16 天預報">Open-Meteo ↗</button><button type="button" class="weather-source-linklike" data-weather-open-cma-detail data-weather-point-key="${esc(point.key)}" title="在本站查看 ${label} 的 CMA GRAPES GFS 模型預報">Open-Meteo (CMA) ↗</button></span></span>`;}
    function sourceFooter(points){
      const providers=[...new Set(points.flatMap(p=>pointRecord(p)?.providers||[]))],providerText=providers.length?providers.map(providerLabel).join(' + '):'尚未取得';
      const publicBlock=`<span class="weather-current-source">本次資料來源：<b>${esc(providerText)}</b></span><span class="weather-source-destinations">${points.map(publicSourceLinks).join('')}</span>`;
      if(!isDev)return publicBlock;
      const elevationDebug=points.map(point=>{const elevation=pointElevation(point);return `${point.label}: ${elevation===null?'尚未取得':formatElevation(elevation)+' m'} · ${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`;}).join(' ｜ ');
      const devBlock=`<span class="weather-dev-source"><b>DEV ONLY</b><span>${esc(networkProfile?.name?.(networkProfile.get())||'國際版')} · 欄位優先順序：高德 → QWeather → Open-Meteo</span><span>資料來源：<a href="${AMAP_SOURCE}" target="_blank" rel="noopener noreferrer">高德天氣 API ↗</a> <a href="${QWEATHER_API_SOURCE}" target="_blank" rel="noopener noreferrer">QWeather API ↗</a> <a href="${OPEN_METEO_SOURCE}" target="_blank" rel="noopener noreferrer">Open-Meteo API ↗</a> <a href="${OPEN_METEO_CMA_SOURCE}" target="_blank" rel="noopener noreferrer">Open-Meteo CMA API ↗</a> <a href="${OPEN_METEO_ELEVATION_SOURCE}" target="_blank" rel="noopener noreferrer">Open-Meteo Elevation API ↗</a></span><span>高德：即時 + 短期預報 · QWeather Weather v1：1 km 經緯度多日 / 逐時預報 · Open-Meteo：逐日 / 逐時預報，最長可到 16 天 · CMA：模型對照入口，不參與主資料合併</span><span>海拔來源：Open-Meteo / Copernicus DEM 90 m · ${esc(elevationDebug)}</span></span>`;
      return publicBlock+devBlock;
    }
    function panelHtml(day){const points=pointsForDay(day),main=points[0]||null;if(!main)return '<div class="weather-loading">此日沒有可用的天氣定位點。</div>';const rows=points.map((p,i)=>weatherRow(p,day.date,{primary:i===0,tripDay:day.day})).join(''),alerts=points.flatMap(p=>alertMessages(getForecast(p,day.date),{highAltitude:p.highAltitude})),updateTimes=points.map(pointUpdate).filter(Boolean),last=updateTimes.length?Math.max(...updateTimes):0,alertHtml=alerts.length?`<div class="weather-alerts">${[...new Set(alerts)].map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';return `<header class="weather-panel-head"><div><span class="eyebrow">WEATHER · 天氣</span><h3>今日天氣</h3></div><button type="button" class="weather-refresh" data-weather-refresh>↻ 更新</button></header><div class="weather-grid">${rows}</div>${alertHtml}<footer class="weather-source"><span>${last?`最後更新 ${esc(formatUpdate(last))}`:'尚未取得預報'} · 自動更新間隔 1 小時 · 可手動更新</span>${sourceFooter(points)}</footer>`;}

    function associatedDay(place){const explicit=Array.isArray(place?.days)?place.days[0]:null;if(explicit)return tripData.days.find(d=>d.day===Number(explicit))||null;return tripData.days.find(d=>d.hotel===place?.id||d.itinerary.includes(place?.id)||d.nearby.includes(place?.id)||d.nightRecommendations.includes(place?.id))||tripData.days.find(d=>d.city===place?.city)||null;}
    function distanceSq(a,b){const x=(Number(a.lat)-Number(b.lat))*111,y=(Number(a.lng)-Number(b.lng))*111*Math.cos(Number(a.lat)*Math.PI/180);return x*x+y*y;}
    function pointForPlace(place,day){const candidates=pointsForDay(day);if(!candidates.length)return null;if(!hasCoords(place))return candidates[0];return candidates.slice().sort((a,b)=>distanceSq(place,a)-distanceSq(place,b))[0];}
    function mapHtml(place,dayValue){const selected=Number(dayValue),day=Number.isFinite(selected)&&selected>0?tripData.days.find(d=>d.day===selected):associatedDay(place);if(!day)return '<span>⌁ 此地點沒有對應旅程日天氣</span>';const point=pointForPlace(place,day),c=compactForecast(point,day.date);if(!point||!c)return `<span>⌁ ${esc(dateLabel(day.date))} · ${esc(noForecastText(day.date))}</span>`;return `<span class="map-weather-main">${c.info.icon} <strong>${esc(dateLabel(day.date))} · ${c.max}° / ${c.min}°</strong> · ${esc(c.info.label)}${c.rain!==null?` · 降雨 ${c.rain}%`:''}</span><small>${esc(point.label)}預報</small>`;}

    function settingsHtml(){
      const amapReady=Boolean(providerConfig.amapKey),qReady=Boolean(providerConfig.qweatherHost&&providerConfig.qweatherKey);
      return `<details class="weather-provider-settings utility-card utility-card--settings" data-weather-settings><summary><span><span class="eyebrow">WEATHER PROVIDERS</span><strong>天氣 API 設定</strong></span><small>高德 ${amapReady?'已設定':'未設定'} · QWeather ${qReady?'已設定':'未設定'} · Open-Meteo 免 Key</small></summary><div class="weather-provider-settings-body"><p class="small">固定欄位優先順序：<b>1 高德天氣 → 2 QWeather Weather v1 → 3 Open-Meteo</b>。可用 provider 會並行請求；同一天同一欄位以較高順位為準，較低順位只補空缺。未設定 Key、超出預報範圍或單一服務失敗時，其他來源仍可補資料。設定只儲存在這台瀏覽器，不寫入 ZIP。</p><div class="weather-provider-form"><label><span>高德 Web Service Key</span><input type="password" value="${esc(providerConfig.amapKey)}" data-weather-config-field="amapKey" autocomplete="off" spellcheck="false" placeholder="未設定"></label><label><span>QWeather API Host</span><input type="text" value="${esc(providerConfig.qweatherHost)}" data-weather-config-field="qweatherHost" autocomplete="off" spellcheck="false" placeholder="xxxx.qweatherapi.com"></label><label><span>QWeather API Key</span><input type="password" value="${esc(providerConfig.qweatherKey)}" data-weather-config-field="qweatherKey" autocomplete="off" spellcheck="false" placeholder="未設定"></label></div><p class="small weather-provider-note">QWeather 已全面改用現行 Weather v1 經緯度預報；本站不再呼叫已棄用的 WebAPI v7 Grid Weather。Weather v1 直接使用查詢座標，官方標示 1 km 解析度。</p><div class="weather-provider-actions"><button type="button" class="primary" data-weather-settings-save>儲存並更新天氣</button><button type="button" class="action" data-weather-settings-clear>清除 API 設定</button><span data-weather-settings-status>${amapReady||qReady?'已啟用多來源模式':'目前由 Open-Meteo 提供資料'}</span></div><div class="weather-source-links"><a href="${AMAP_SOURCE}" target="_blank" rel="noopener noreferrer">高德天氣 API ↗</a><a href="${QWEATHER_SOURCE}" target="_blank" rel="noopener noreferrer">QWeather Weather v1 每日預報 ↗</a><a href="${QWEATHER_HOURLY_SOURCE}" target="_blank" rel="noopener noreferrer">QWeather Weather v1 逐時預報 ↗</a></div></div></details>`;
    }
    function syncSettingsStatus(root=document){const card=root?.closest?.('[data-weather-settings]')||root?.querySelector?.('[data-weather-settings]')||null;if(!card)return;const status=card.querySelector('[data-weather-settings-status]'),summary=card.querySelector('summary small'),amapReady=Boolean(providerConfig.amapKey),qReady=Boolean(providerConfig.qweatherHost&&providerConfig.qweatherKey);if(status)status.textContent=amapReady||qReady?'已啟用多來源模式':'目前由 Open-Meteo 提供資料';if(summary)summary.textContent=`高德 ${amapReady?'已設定':'未設定'} · QWeather ${qReady?'已設定':'未設定'} · Open-Meteo 免 Key`;}
    function saveSettings(button){const card=button.closest('[data-weather-settings]');if(!card)return false;const next={...providerConfig};card.querySelectorAll('[data-weather-config-field]').forEach(input=>{next[input.dataset.weatherConfigField]=input.value.trim();});next.qweatherHost=cleanHost(next.qweatherHost);providerConfig={amapKey:next.amapKey||'',qweatherHost:next.qweatherHost||'',qweatherKey:next.qweatherKey||''};saveProviderConfig();cache={records:{}};saveCache();syncSettingsStatus(card);toast?.('天氣 API 設定已儲存，正在依優先順序更新…');refresh(true);return true;}
    function clearSettings(button){const card=button.closest('[data-weather-settings]');providerConfig={amapKey:'',qweatherHost:'',qweatherKey:''};saveProviderConfig();cache={records:{}};saveCache();card?.querySelectorAll('[data-weather-config-field]').forEach(input=>{input.value='';});syncSettingsStatus(card);toast?.('已清除高德／QWeather 設定，改由 Open-Meteo');refresh(true);return true;}
    function clearCache({notify=true}={}){cache={records:{}};saveCache();hydrate();if(notify)toast?.('已清除天氣快取');return true;}

    function hydrate(root=document){const scope=root?.querySelectorAll?root:document,summaries=[];if(scope.matches?.('[data-weather-day-summary]'))summaries.push(scope);scope.querySelectorAll?.('[data-weather-day-summary]').forEach(el=>summaries.push(el));summaries.forEach(el=>{const day=tripData.days.find(d=>d.day===Number(el.dataset.weatherDaySummary));if(day)el.innerHTML=summaryHtml(day);});const panels=[];if(scope.matches?.('[data-weather-day-panel]'))panels.push(scope);scope.querySelectorAll?.('[data-weather-day-panel]').forEach(el=>panels.push(el));panels.forEach(el=>{const day=tripData.days.find(d=>d.day===Number(el.dataset.weatherDayPanel));if(day)el.innerHTML=panelHtml(day);});const mapNodes=[];if(scope.matches?.('[data-weather-map-place]'))mapNodes.push(scope);scope.querySelectorAll?.('[data-weather-map-place]').forEach(el=>mapNodes.push(el));mapNodes.forEach(el=>{const p=items[el.dataset.weatherMapPlace];if(p)el.innerHTML=mapHtml(p,el.dataset.weatherMapDay||'all');});}
    function handleAction(button){if(button?.hasAttribute('data-weather-detail-close')){button.closest('dialog')?.close();return true;}if(button?.hasAttribute('data-weather-open-amap-detail'))return openAmapDetail(button);if(button?.hasAttribute('data-weather-open-meteo-detail'))return openOpenMeteoDetail(button);if(button?.hasAttribute('data-weather-open-cma-detail'))return openOpenMeteoCmaDetail(button);if(button?.hasAttribute('data-weather-live-open')||button?.hasAttribute('data-xhs-open'))return openXhs(button);if(button?.hasAttribute('data-weather-live-launch'))return launchXhs();if(button?.hasAttribute('data-weather-live-dialog-copy'))return copyXhs();if(button?.hasAttribute('data-xhs-alternate'))return alternateXhs();if(button?.hasAttribute('data-weather-settings-save'))return saveSettings(button);if(button?.hasAttribute('data-weather-settings-clear'))return clearSettings(button);if(!button?.hasAttribute('data-weather-refresh'))return false;button.disabled=true;refresh(true).finally(()=>{button.disabled=false;});return true;}
    function start(){hydrate();liveDateKey=liveDate(0).iso;refresh(false);timer=setInterval(()=>refresh(false),CACHE_TTL);liveDateTimer=setInterval(()=>{const next=liveDate(0).iso;if(next!==liveDateKey){liveDateKey=next;hydrate();}},60000);window.addEventListener('online',()=>refresh(false),{passive:true});}
    function cleanup(){if(timer)clearInterval(timer);if(liveDateTimer)clearInterval(liveDateTimer);timer=null;liveDateTimer=null;}
    return {daySummaryPlaceholder,dayPanelPlaceholder,mapPlaceholder,hydrate,handleAction,start,refresh,clearCache,cleanup,settingsHtml,itemXhsData,isStorageAvailable:()=>storageAvailable};
  }

  window.YunnanWeatherSystem={create};
})();
